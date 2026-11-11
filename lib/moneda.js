// Convierte importes escritos por las plataformas ("$5.00", "MX$100.00", "1.000,50 €", "ARS 2,000")
// en { valor, moneda, usd }. El equivalente en dólares es aproximado (tabla fija) y solo sirve para
// comparar donaciones de distintas monedas, por ejemplo para ordenar o para alertas por nivel.

// Símbolos, de más largo a más corto para que "MX$" gane a "$".
const SIMBOLOS = [
  ['US$', 'USD'], ['CA$', 'CAD'], ['MX$', 'MXN'], ['NZ$', 'NZD'], ['HK$', 'HKD'], ['NT$', 'TWD'], ['A$', 'AUD'], ['R$', 'BRL'],
  ['S/', 'PEN'], ['zł', 'PLN'], ['Kč', 'CZK'], ['€', 'EUR'], ['£', 'GBP'], ['¥', 'JPY'], ['₹', 'INR'], ['₩', 'KRW'], ['₱', 'PHP'],
  ['₪', 'ILS'], ['₫', 'VND'], ['₺', 'TRY'], ['₽', 'RUB'], ['₡', 'CRC'], ['$', 'USD'],
];

// Dólares por unidad, aproximados. Revisar de vez en cuando; no hace falta precisión.
const USD = {
  USD: 1, EUR: 1.08, GBP: 1.27, CAD: 0.72, AUD: 0.65, NZD: 0.59, MXN: 0.054, BRL: 0.18, HKD: 0.128, TWD: 0.031, JPY: 0.0066,
  INR: 0.012, KRW: 0.00072, PHP: 0.017, ILS: 0.27, VND: 0.00004, TRY: 0.029, RUB: 0.011, PLN: 0.25, CZK: 0.043, HUF: 0.0027,
  CHF: 1.13, SEK: 0.094, NOK: 0.092, DKK: 0.145, ARS: 0.001, CLP: 0.00105, COP: 0.00025, PEN: 0.27, UYU: 0.025, BOB: 0.145,
  PYG: 0.00013, CRC: 0.0019, GTQ: 0.13, DOP: 0.017, HNL: 0.04, NIO: 0.027, SGD: 0.74, MYR: 0.22, THB: 0.029, IDR: 0.000063,
  ZAR: 0.055, SAR: 0.27, AED: 0.27, QAR: 0.27, EGP: 0.02, RON: 0.22, BGN: 0.55, RSD: 0.0092, UAH: 0.024, KZT: 0.002,
};

// "1.234,56" / "1,234.56" / "1.000" / "5,00" → número. Un separador seguido de exactamente 3 cifras al final
// es de miles; con 1 o 2 cifras, decimal.
function numero(texto) {
  const s = (texto.match(/\d[\d.,\s  ]*/) || [''])[0].replace(/[\s  ]/g, '').replace(/[.,]$/, '');
  if (!s) return null;
  const ultimo = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (ultimo < 0) return Number(s);
  const decimales = s.length - ultimo - 1;
  const sep = s[ultimo];
  const otros = s.slice(0, ultimo).includes(sep === '.' ? ',' : '.');
  if (decimales === 3 && !otros) return Number(s.replace(/[.,]/g, ''));
  return Number(s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + s.slice(ultimo + 1));
}

function leerImporte(texto) {
  if (!texto) return null;
  const t = String(texto).trim();
  const valor = numero(t);
  if (valor == null || Number.isNaN(valor)) return null;
  let moneda = (t.match(/\b([A-Z]{3})\b/) || [])[1];
  if (!moneda || !(moneda in USD)) moneda = (SIMBOLOS.find(([s]) => t.includes(s)) || [])[1] || moneda || '?';
  const tasa = USD[moneda];
  return { valor, moneda, usd: tasa ? Math.round(valor * tasa * 100) / 100 : null, texto: t };
}

module.exports = { leerImporte, numero };
