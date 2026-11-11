// Biblioteca de archivos del usuario para las alertas: sonidos propios e imágenes, GIF o vídeos.
// Se guardan en userdata/medios/ con un nombre aleatorio y se sirven en /medios/<archivo>.
// Solo se aceptan tipos de imagen, vídeo y audio conocidos (nada de HTML, SVG ni ejecutables).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TIPOS = {
  '.png': ['imagen', 'image/png'], '.jpg': ['imagen', 'image/jpeg'], '.jpeg': ['imagen', 'image/jpeg'],
  '.gif': ['imagen', 'image/gif'], '.webp': ['imagen', 'image/webp'], '.apng': ['imagen', 'image/apng'],
  '.mp4': ['video', 'video/mp4'], '.webm': ['video', 'video/webm'],
  '.mp3': ['audio', 'audio/mpeg'], '.ogg': ['audio', 'audio/ogg'], '.wav': ['audio', 'audio/wav'], '.m4a': ['audio', 'audio/mp4'],
};
const MAXIMO = 50 * 1024 * 1024;

class Medios {
  constructor(carpeta) { this.carpeta = carpeta; }

  // nombre original → { url, tipo, nombre }. Lanza error si el tipo no se admite o es demasiado grande.
  guardar(nombreOriginal, datos) {
    const ext = path.extname(String(nombreOriginal || '')).toLowerCase();
    if (!TIPOS[ext]) throw new Error('Tipo de archivo no admitido. Usa PNG, JPG, GIF, WebP, MP4, WebM, MP3, OGG, WAV o M4A.');
    if (!datos?.length) throw new Error('El archivo está vacío');
    if (datos.length > MAXIMO) throw new Error('El archivo pesa más de 50 MB');
    // Nombre legible para el usuario, sin caracteres raros, más un prefijo aleatorio para que no choquen.
    const base = path.basename(nombreOriginal, path.extname(nombreOriginal)).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'archivo';
    const archivo = `${crypto.randomBytes(4).toString('hex')}-${base}${ext}`;
    fs.mkdirSync(this.carpeta, { recursive: true });
    fs.writeFileSync(path.join(this.carpeta, archivo), datos);
    return this.info(archivo);
  }

  info(archivo) {
    const ext = path.extname(archivo).toLowerCase();
    return { url: `/medios/${archivo}`, tipo: TIPOS[ext][0], nombre: archivo.replace(/^[0-9a-f]{8}-/, '') };
  }

  lista() {
    let archivos = [];
    try { archivos = fs.readdirSync(this.carpeta); } catch { /* aún no hay ninguno */ }
    return archivos.filter(a => TIPOS[path.extname(a).toLowerCase()]).sort().map(a => this.info(a));
  }

  // Ruta segura dentro de la carpeta, o null.
  ruta(archivo) {
    const nombre = path.basename(String(archivo || ''));
    if (!nombre || nombre !== archivo || !TIPOS[path.extname(nombre).toLowerCase()]) return null;
    const r = path.join(this.carpeta, nombre);
    return fs.existsSync(r) ? r : null;
  }

  mime(archivo) { return TIPOS[path.extname(archivo).toLowerCase()]?.[1] || 'application/octet-stream'; }

  borrar(archivo) {
    const r = this.ruta(archivo);
    if (r) fs.unlinkSync(r);
    return !!r;
  }
}

module.exports = { Medios, TIPOS, MAXIMO };
