export const passwordRequirements = (password: string, minimumLength = 8) => {
  const normalized = password.normalize("NFC");
  return {
    minimumLength: [...normalized].length >= minimumLength,
    lowercase: /\p{Ll}/u.test(normalized),
    uppercase: /\p{Lu}/u.test(normalized),
    number: /\p{Nd}/u.test(normalized),
    special: /[\p{P}\p{S}]/u.test(normalized)
  };
};

export type PasswordRequirementsState = ReturnType<typeof passwordRequirements>;
