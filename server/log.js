export function log(tag, ...args) {
  const t = new Date().toISOString().slice(11, 23);
  console.log(`[${t}] [${tag}]`, ...args);
}