/** Ширина и высота PNG из заголовка IHDR — чтобы вставить рисунок в Word без искажения пропорций. */
export function imageSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Рисунок должен быть в формате PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
