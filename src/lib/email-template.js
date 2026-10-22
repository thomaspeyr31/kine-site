// Gabarit d'e-mail : version HTML (styles en ligne, compatible Gmail / Outlook / Apple Mail) + version texte.
const config = require('../config');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const C = { paper: '#f6f3ee', card: '#ffffff', ink: '#1d2a2c', muted: '#5f6b68', line: '#e2ddd3', primary: '#0f5c55', accent: '#d9603f', soft: '#dcebe7' };

/**
 * @param {object} o
 * @param {string} o.title       Titre principal
 * @param {string[]} [o.paragraphs]  Paragraphes (texte brut)
 * @param {Array<[string,string]>} [o.details]  Tableau libellé / valeur
 * @param {{label:string,url:string}} [o.button]
 * @param {string} [o.note]      Encadré d'information (texte brut)
 * @param {string[]} [o.after]   Paragraphes après le bouton
 * @param {Array<{label:string,url:string}>} [o.links]  Liens secondaires (en fin de message)
 */
function renderEmail({ title, paragraphs = [], details = [], button, note, after = [], links = [] }) {
  const { site } = config;
  const p = (t) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:${C.ink}">${esc(t).replace(/\n/g, '<br>')}</p>`;
  const rows = details.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `
    <tr>
      <td style="padding:9px 12px 9px 0;color:${C.muted};font-size:14px;vertical-align:top;white-space:nowrap">${esc(k)}</td>
      <td style="padding:9px 0;color:${C.ink};font-size:15px;font-weight:bold;vertical-align:top">${esc(v).replace(/\n/g, '<br>')}</td>
    </tr>`).join('');

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.paper};font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <tr><td style="padding:0 4px 16px;font-size:18px;font-weight:bold;color:${C.primary}">✚ ${esc(site.name)}</td></tr>
        <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:28px">
          <h1 style="margin:0 0 18px;font-size:22px;line-height:1.25;color:${C.ink}">${esc(title)}</h1>
          ${paragraphs.map(p).join('')}
          ${rows ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;border-top:1px solid ${C.line};border-bottom:1px solid ${C.line};width:100%">${rows}</table>` : ''}
          ${note ? `<div style="margin:0 0 18px;padding:12px 14px;background:${C.soft};border-radius:10px;color:${C.primary};font-size:14px;line-height:1.5">${esc(note).replace(/\n/g, '<br>')}</div>` : ''}
          ${button ? `<p style="margin:6px 0 18px"><a href="${esc(button.url)}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;font-size:15px">${esc(button.label)}</a></p>` : ''}
          ${after.map(p).join('')}
          ${links.length ? `<p style="margin:4px 0 0;font-size:14px;line-height:1.8">${links.map((l) => `<a href="${esc(l.url)}" style="color:${C.primary}">${esc(l.label)}</a>`).join(' &nbsp;·&nbsp; ')}</p>` : ''}
        </td></tr>
        <tr><td style="padding:16px 4px;color:${C.muted};font-size:12px;line-height:1.6">
          ${esc(site.name)} · ${esc(site.therapist)}, masseur-kinésithérapeute<br>
          ${esc(site.address)} · ${esc(site.phone)}<br>
          <a href="${esc(config.baseUrl)}" style="color:${C.muted}">${esc(config.baseUrl.replace(/^https?:\/\//, ''))}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    title, '',
    ...paragraphs.flatMap((t) => [t, '']),
    ...details.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k} : ${v}`),
    details.length ? '' : null,
    note ? `${note}\n` : null,
    button ? `${button.label} : ${button.url}\n` : null,
    ...after.flatMap((t) => [t, '']),
    ...links.map((l) => `${l.label} : ${l.url}`),
  ].filter((l) => l !== null).join('\n');

  return { html, text };
}

module.exports = { renderEmail };
