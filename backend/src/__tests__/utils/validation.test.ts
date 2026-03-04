import {
  isValidEmail,
  isValidAddress,
  isValidGithubUsername,
  isValidSkills,
  isValidBio,
  isValidHourlyRate,
  isValidAvailability,
  validateCreateDeveloper,
  validateUpdateDeveloper,
} from '../../utils/validation';

// =============================================================================
// isValidEmail
// =============================================================================
describe('isValidEmail', () => {
  it('accepts standard email', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('accepts email with subdomain', () => {
    expect(isValidEmail('user@mail.example.com')).toBe(true);
  });

  it('accepts email with plus alias', () => {
    expect(isValidEmail('user+tag@example.com')).toBe(true);
  });

  it('rejects missing @', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects missing local part', () => {
    expect(isValidEmail('@example.com')).toBe(false);
  });

  it('rejects email with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });
});

// =============================================================================
// isValidAddress
// =============================================================================
describe('isValidAddress', () => {
  it('accepts valid lowercase address', () => {
    expect(isValidAddress('0x' + 'ab'.repeat(20))).toBe(true);
  });

  it('accepts valid uppercase address', () => {
    expect(isValidAddress('0x' + 'AB'.repeat(20))).toBe(true);
  });

  it('accepts valid mixed-case address', () => {
    expect(isValidAddress('0xAbCdEf0123456789AbCdEf0123456789AbCdEf01')).toBe(true);
  });

  it('rejects address without 0x prefix', () => {
    expect(isValidAddress('ab'.repeat(20))).toBe(false);
  });

  it('rejects too short address', () => {
    expect(isValidAddress('0x' + 'ab'.repeat(19))).toBe(false);
  });

  it('rejects too long address', () => {
    expect(isValidAddress('0x' + 'ab'.repeat(21))).toBe(false);
  });

  it('rejects address with invalid characters', () => {
    expect(isValidAddress('0x' + 'gg'.repeat(20))).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidAddress('')).toBe(false);
  });
});

// =============================================================================
// isValidGithubUsername
// =============================================================================
describe('isValidGithubUsername', () => {
  it('accepts alphanumeric username', () => {
    expect(isValidGithubUsername('username123')).toBe(true);
  });

  it('accepts username with hyphens', () => {
    expect(isValidGithubUsername('my-user')).toBe(true);
  });

  it('accepts single character', () => {
    expect(isValidGithubUsername('a')).toBe(true);
  });

  it('accepts 39-char username (max length)', () => {
    expect(isValidGithubUsername('a'.repeat(39))).toBe(true);
  });

  it('rejects 40-char username (over max)', () => {
    expect(isValidGithubUsername('a'.repeat(40))).toBe(false);
  });

  it('rejects username with underscores', () => {
    expect(isValidGithubUsername('my_user')).toBe(false);
  });

  it('rejects username with dots', () => {
    expect(isValidGithubUsername('my.user')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidGithubUsername('')).toBe(false);
  });
});

// =============================================================================
// isValidSkills
// =============================================================================
describe('isValidSkills', () => {
  it('accepts array with one skill', () => {
    expect(isValidSkills(['Solidity'])).toBe(true);
  });

  it('accepts array with 10 skills', () => {
    expect(isValidSkills(Array.from({ length: 10 }, (_, i) => `Skill${i}`))).toBe(true);
  });

  it('rejects empty array', () => {
    expect(isValidSkills([])).toBe(false);
  });

  it('rejects array with 11 skills', () => {
    expect(isValidSkills(Array.from({ length: 11 }, (_, i) => `Skill${i}`))).toBe(false);
  });

  it('rejects non-array', () => {
    expect(isValidSkills('Solidity')).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidSkills(null)).toBe(false);
  });

  it('rejects array with empty string element', () => {
    expect(isValidSkills(['Solidity', ''])).toBe(false);
  });

  it('rejects array with non-string element', () => {
    expect(isValidSkills(['Solidity', 42])).toBe(false);
  });
});

// =============================================================================
// isValidBio
// =============================================================================
describe('isValidBio', () => {
  it('accepts bio under 500 chars', () => {
    expect(isValidBio('Short bio')).toBe(true);
  });

  it('accepts bio exactly 500 chars', () => {
    expect(isValidBio('x'.repeat(500))).toBe(true);
  });

  it('rejects bio over 500 chars', () => {
    expect(isValidBio('x'.repeat(501))).toBe(false);
  });

  it('accepts empty bio', () => {
    expect(isValidBio('')).toBe(true);
  });
});

// =============================================================================
// isValidHourlyRate
// =============================================================================
describe('isValidHourlyRate', () => {
  it('accepts rate of 1', () => {
    expect(isValidHourlyRate(1)).toBe(true);
  });

  it('accepts rate of 10000', () => {
    expect(isValidHourlyRate(10000)).toBe(true);
  });

  it('accepts fractional rate', () => {
    expect(isValidHourlyRate(50.5)).toBe(true);
  });

  it('rejects rate of 0', () => {
    expect(isValidHourlyRate(0)).toBe(false);
  });

  it('rejects negative rate', () => {
    expect(isValidHourlyRate(-1)).toBe(false);
  });

  it('rejects rate over 10000', () => {
    expect(isValidHourlyRate(10001)).toBe(false);
  });
});

// =============================================================================
// isValidAvailability
// =============================================================================
describe('isValidAvailability', () => {
  it('accepts "available"', () => {
    expect(isValidAvailability('available')).toBe(true);
  });

  it('accepts "busy"', () => {
    expect(isValidAvailability('busy')).toBe(true);
  });

  it('accepts "vacation"', () => {
    expect(isValidAvailability('vacation')).toBe(true);
  });

  it('rejects unknown status', () => {
    expect(isValidAvailability('offline')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidAvailability('')).toBe(false);
  });
});

// =============================================================================
// validateCreateDeveloper
// =============================================================================
describe('validateCreateDeveloper', () => {
  const validInput = {
    address: '0x' + 'ab'.repeat(20),
    signature: '0xsig123',
    message: 'sign this',
    email: 'dev@example.com',
    skills: ['Solidity'],
  };

  it('returns no errors for valid input', () => {
    expect(validateCreateDeveloper(validInput)).toEqual([]);
  });

  it('returns error for missing address', () => {
    const errors = validateCreateDeveloper({ ...validInput, address: '' });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'address' }));
  });

  it('returns error for invalid address', () => {
    const errors = validateCreateDeveloper({ ...validInput, address: 'not-an-address' });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'address' }));
  });

  it('returns error for missing signature', () => {
    const errors = validateCreateDeveloper({ ...validInput, signature: '' });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'signature' }));
  });

  it('returns error for missing message', () => {
    const errors = validateCreateDeveloper({ ...validInput, message: '' });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'message' }));
  });

  it('returns error for missing email', () => {
    const errors = validateCreateDeveloper({ ...validInput, email: '' });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'email' }));
  });

  it('returns error for invalid email', () => {
    const errors = validateCreateDeveloper({ ...validInput, email: 'bad-email' });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'email' }));
  });

  it('returns error for missing skills', () => {
    const errors = validateCreateDeveloper({ ...validInput, skills: undefined });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'skills' }));
  });

  it('returns error for empty skills array', () => {
    const errors = validateCreateDeveloper({ ...validInput, skills: [] });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'skills' }));
  });

  it('returns no error for valid optional githubUsername', () => {
    const errors = validateCreateDeveloper({ ...validInput, githubUsername: 'myuser' });
    expect(errors).toEqual([]);
  });

  it('returns error for invalid githubUsername', () => {
    const errors = validateCreateDeveloper({ ...validInput, githubUsername: 'a'.repeat(40) });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'githubUsername' }));
  });

  it('returns no error when githubUsername is omitted', () => {
    const errors = validateCreateDeveloper(validInput);
    expect(errors.find(e => e.field === 'githubUsername')).toBeUndefined();
  });

  it('returns error for bio over 500 chars', () => {
    const errors = validateCreateDeveloper({ ...validInput, bio: 'x'.repeat(501) });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'bio' }));
  });

  it('returns error for invalid hourlyRate', () => {
    const errors = validateCreateDeveloper({ ...validInput, hourlyRate: -5 });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'hourlyRate' }));
  });

  it('returns multiple errors for completely invalid input', () => {
    const errors = validateCreateDeveloper({});
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});

// =============================================================================
// validateUpdateDeveloper
// =============================================================================
describe('validateUpdateDeveloper', () => {
  const validInput = {
    address: '0x' + 'ab'.repeat(20),
    signature: '0xsig123',
    message: 'sign this',
  };

  it('returns no errors for minimal valid input', () => {
    expect(validateUpdateDeveloper(validInput)).toEqual([]);
  });

  it('returns error for missing address', () => {
    const errors = validateUpdateDeveloper({ ...validInput, address: '' });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'address' }));
  });

  it('returns error for missing signature', () => {
    const errors = validateUpdateDeveloper({ ...validInput, signature: '' });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'signature' }));
  });

  it('returns error for missing message', () => {
    const errors = validateUpdateDeveloper({ ...validInput, message: '' });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'message' }));
  });

  it('allows valid optional email', () => {
    const errors = validateUpdateDeveloper({ ...validInput, email: 'new@example.com' });
    expect(errors).toEqual([]);
  });

  it('returns error for invalid optional email', () => {
    const errors = validateUpdateDeveloper({ ...validInput, email: 'bad' });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'email' }));
  });

  it('allows valid optional skills', () => {
    const errors = validateUpdateDeveloper({ ...validInput, skills: ['Rust'] });
    expect(errors).toEqual([]);
  });

  it('returns error for invalid optional skills', () => {
    const errors = validateUpdateDeveloper({ ...validInput, skills: [] });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'skills' }));
  });

  it('returns error for invalid availability', () => {
    const errors = validateUpdateDeveloper({ ...validInput, availability: 'offline' });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'availability' }));
  });

  it('allows valid availability', () => {
    const errors = validateUpdateDeveloper({ ...validInput, availability: 'busy' });
    expect(errors).toEqual([]);
  });
});
