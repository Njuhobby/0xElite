/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate GitHub username format
 */
export function isValidGithubUsername(username: string): boolean {
  // GitHub usernames: alphanumeric and hyphens, 1-39 chars
  return /^[a-zA-Z0-9-]{1,39}$/.test(username);
}

/**
 * Validate skills array
 */
export function isValidSkills(skills: any): boolean {
  if (!Array.isArray(skills)) return false;
  if (skills.length < 1 || skills.length > 10) return false;
  return skills.every(skill => typeof skill === 'string' && skill.length > 0);
}

/**
 * Validate bio length
 */
export function isValidBio(bio: string): boolean {
  return bio.length <= 500;
}

/**
 * Validate hourly rate
 */
export function isValidHourlyRate(rate: number): boolean {
  return rate > 0 && rate <= 10000;
}

/**
 * Validate availability status
 */
export function isValidAvailability(availability: string): boolean {
  return ['available', 'busy', 'vacation'].includes(availability);
}

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate developer creation input
 */
export function validateCreateDeveloper(data: any): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate address
  if (!data.address || !isValidAddress(data.address)) {
    errors.push({ field: 'address', message: 'Invalid Ethereum address format' });
  }

  // Validate signature
  if (!data.signature || typeof data.signature !== 'string') {
    errors.push({ field: 'signature', message: 'Signature is required' });
  }

  // Validate message
  if (!data.message || typeof data.message !== 'string') {
    errors.push({ field: 'message', message: 'Message is required' });
  }

  // Validate email
  if (!data.email || !isValidEmail(data.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  }

  // Validate GitHub username (optional)
  if (data.githubUsername && !isValidGithubUsername(data.githubUsername)) {
    errors.push({ field: 'githubUsername', message: 'Invalid GitHub username format' });
  }

  // Validate skills
  if (!data.skills || !isValidSkills(data.skills)) {
    errors.push({ field: 'skills', message: 'Must select 1-10 skills' });
  }

  // Validate bio (optional)
  if (data.bio && !isValidBio(data.bio)) {
    errors.push({ field: 'bio', message: 'Bio must be 500 characters or less' });
  }

  // Validate hourly rate (optional)
  if (data.hourlyRate && !isValidHourlyRate(data.hourlyRate)) {
    errors.push({ field: 'hourlyRate', message: 'Hourly rate must be between 0 and 10000' });
  }

  return errors;
}

/**
 * Validate developer update input
 */
export function validateUpdateDeveloper(data: any): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate address
  if (!data.address || !isValidAddress(data.address)) {
    errors.push({ field: 'address', message: 'Invalid Ethereum address format' });
  }

  // Validate signature
  if (!data.signature || typeof data.signature !== 'string') {
    errors.push({ field: 'signature', message: 'Signature is required' });
  }

  // Validate message
  if (!data.message || typeof data.message !== 'string') {
    errors.push({ field: 'message', message: 'Message is required' });
  }

  // Validate email (optional)
  if (data.email && !isValidEmail(data.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  }

  // Validate skills (optional)
  if (data.skills && !isValidSkills(data.skills)) {
    errors.push({ field: 'skills', message: 'Must select 1-10 skills' });
  }

  // Validate bio (optional)
  if (data.bio && !isValidBio(data.bio)) {
    errors.push({ field: 'bio', message: 'Bio must be 500 characters or less' });
  }

  // Validate hourly rate (optional)
  if (data.hourlyRate && !isValidHourlyRate(data.hourlyRate)) {
    errors.push({ field: 'hourlyRate', message: 'Hourly rate must be between 0 and 10000' });
  }

  // Validate availability (optional)
  if (data.availability && !isValidAvailability(data.availability)) {
    errors.push({ field: 'availability', message: 'Invalid availability status' });
  }

  return errors;
}
