// Mirrors the backend password rules so users get instant feedback.
// The backend still validates everything independently.
export const PASSWORD_HINT = '8–72 characters, including a letter and a number.'

export function passwordError(password) {
  if (password.length < 8 || password.length > 72) return 'Password must be 8–72 characters'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain a letter and a number'
  return ''
}
