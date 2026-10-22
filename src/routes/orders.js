const express = require('express');
const Stripe = require('stripe');
const db = require('../db');
const config = require('../config');
const { HttpError, int, wrap } = require('../lib/http');
const { requireAuth } = require('../lib/auth');
const { sendMail } = require('../lib/mailer');
const { nextInvoiceNumber, invoicePdf } = require('../lib/invoice');
const { ownsProgram } = require('./programs');

const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;
const router = express.Router();

// Passe une commande en "payée" et lui attribue son numéro de facture.
// Idempotent : le webhook et le retour client peuvent arriver tous les deux.
async function markPaid(sessionId, paymentIntent) {
  const paid = await db.transaction(async (conn) => {
    const [r] = await conn.query(
      "UPDATE orders SET status = 'paid', paid_at = NOW(), stripe_payment_intent = ? WHERE stripe_session_id = ? AND status = 'pending'",
      [paymentIntent || null, sessionId]
    );
    if (!r.affectedRows) return false;
    const number = await nextInvoiceNumber(conn);
    await conn.query('UPDATE orders SET invoice_number = ? WHERE stripe_session_id = ?', [number, sessionId]);
    return true;
  });
  if (!paid) return;

  const o = await db.one(
    `SELECT o.*, p.slug, u.first_name FROM orders o
     JOIN programs p ON p.id = o.program_id LEFT JOIN users u ON u.id = o.user_id
     WHERE o.stripe_session_id = ?`,
    [sessionId]
  );
  let attachments;
  try {
    attachments = [{ filename: `facture-${o.invoice_number}.pdf`, content: await invoicePdf(o) }];
  } catch (err) {
    console.error('Génération de facture échouée :', err.message);
  }
  sendMail({
    to: o.billing_email,
    subject: `Votre programme « ${o.program_title} »`,
    text: `Bonjour ${o.first_name || ''},\n\nMerci pour votre achat ! Votre programme est disponible dans votre espace :\n${config.baseUrl}/mon-programme.html?slug=${o.slug}\n\nVous trouverez votre facture ${o.invoice_number} en pièce jointe (elle reste téléchargeable depuis votre espace).\n\nArrêtez un exercice en cas de douleur inhabituelle et n'hésitez pas à réserver un suivi au cabinet.`,
    attachments,
  });
}

// Démarre le paiement d'un programme
router.post('/checkout', requireAuth, wrap(async (req, res) => {
  const programId = int(req.body.programId, { min: 1, label: 'Programme' });
  if (req.body.acceptCgv !== true) throw new HttpError(400, 'Merci d\'accepter les conditions générales de vente.');
  if (req.body.waiver !== true) throw new HttpError(400, 'Merci de confirmer l\'accès immédiat au programme (case à cocher).');

  const program = await db.one('SELECT * FROM programs WHERE id = ? AND is_published = 1', [programId]);
  if (!program) throw new HttpError(404, 'Programme introuvable.');
  if (await ownsProgram(req.user, program.id)) throw new HttpError(409, 'Vous avez déjà ce programme.');
  if (!stripe && !config.demoPayments) throw new HttpError(503, 'Le paiement en ligne est momentanément indisponible.');

  const order = {
    user_id: req.user.id,
    program_id: program.id,
    program_title: program.title,
    billing_name: `${req.user.first_name} ${req.user.last_name}`,
    billing_email: req.user.email,
    amount_cents: program.price_cents,
    vat_rate_bp: Math.round(config.legal.vatRate * 100),
  };
  const insert = (sessionId) => db.query(
    'INSERT INTO orders SET ?, cgv_accepted_at = NOW(), waiver_accepted_at = NOW()',
    [{ ...order, stripe_session_id: sessionId }]
  );

  // Mode démo (développement sans clé Stripe) : achat validé immédiatement
  if (!stripe) {
    const fakeSession = `demo_${Date.now()}_${req.user.id}`;
    await insert(fakeSession);
    await markPaid(fakeSession, null);
    return res.json({ url: `/mon-programme.html?slug=${program.slug}&achat=ok` });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    locale: 'fr',
    customer_email: req.user.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: program.price_cents,
        product_data: { name: program.title, description: program.short_description },
      },
    }],
    metadata: { user_id: String(req.user.id), program_id: String(program.id) },
    success_url: `${config.baseUrl}/compte.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.baseUrl}/programme.html?slug=${program.slug}&annule=1`,
  });
  await insert(session.id);
  res.json({ url: session.url });
}));

// Au retour de Stripe : vérifie le paiement (utile si le webhook n'est pas encore arrivé)
router.post('/confirm', requireAuth, wrap(async (req, res) => {
  const sessionId = typeof req.body.sessionId === 'string' ? req.body.sessionId : '';
  const order = await db.one('SELECT * FROM orders WHERE stripe_session_id = ? AND user_id = ?', [sessionId, req.user.id]);
  if (!order) throw new HttpError(404, 'Commande introuvable.');
  if (order.status === 'pending' && stripe) {
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    if (s.payment_status === 'paid') await markPaid(sessionId, s.payment_intent);
  }
  const updated = await db.one('SELECT status FROM orders WHERE id = ?', [order.id]);
  res.json({ status: updated.status });
}));

// Webhook Stripe (monté avant express.json dans server.js : il faut le corps brut)
async function webhook(req, res) {
  if (!stripe || !config.stripe.webhookSecret) return res.status(400).send('Webhook non configuré');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripe.webhookSecret);
  } catch (err) {
    return res.status(400).send(`Signature invalide : ${err.message}`);
  }
  try {
    const obj = event.data.object;
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) && obj.payment_status === 'paid') {
      await markPaid(obj.id, obj.payment_intent);
    } else if (event.type === 'checkout.session.expired') {
      await db.query("UPDATE orders SET status = 'cancelled' WHERE stripe_session_id = ? AND status = 'pending'", [obj.id]);
    } else if (event.type === 'charge.refunded' && obj.refunded) {
      // Remboursement total fait depuis le tableau de bord Stripe : l'accès au programme est retiré
      await db.query("UPDATE orders SET status = 'refunded' WHERE stripe_payment_intent = ? AND status = 'paid'", [obj.payment_intent]);
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook :', err);
    res.status(500).send('Erreur');
  }
}

module.exports = router;
module.exports.webhook = webhook;
