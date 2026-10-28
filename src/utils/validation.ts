export function digitsOnly(value: string) {
  return value.replace(/\D/g, '').slice(0, 10);
}

export function isValidMexicanPhone(value: string) {
  return value.length === 10 && /^\d{10}$/.test(value);
}
