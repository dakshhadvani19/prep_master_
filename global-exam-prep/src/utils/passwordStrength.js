/**
 * Password strength checker — NIST SP 800-63B + OWASP ASVS compliant
 * Returns null for empty input, otherwise returns a strength descriptor object.
 */

const COMMON_PASSWORDS = new Set([
    'password','password1','12345678','123456789','qwerty123','iloveyou',
    'admin123','letmein1','welcome1','monkey123','dragon123','master123',
    'sunshine','princess','football','shadow123','superman1','batman123',
    'hello123','test1234','abc12345','pass1234','changeme','password!',
]);

/**
 * @param {string} password
 * @returns {null | {score:number, label:string, color:string, percent:number, checks:object, isAcceptable:boolean}}
 */
export function checkPasswordStrength(password) {
    if (!password) return null;

    const checks = {
        length:    { pass: password.length >= 8,                              label: 'At least 8 characters'         },
        uppercase: { pass: /[A-Z]/.test(password),                            label: 'One uppercase letter (A–Z)'    },
        lowercase: { pass: /[a-z]/.test(password),                            label: 'One lowercase letter (a–z)'    },
        number:    { pass: /[0-9]/.test(password),                            label: 'One number (0–9)'              },
        special:   { pass: /[^A-Za-z0-9]/.test(password),                    label: 'One special character (!@#…)'  },
        notCommon: { pass: !COMMON_PASSWORDS.has(password.toLowerCase()),     label: 'Not a commonly used password'  },
    };

    const score = Object.values(checks).filter(c => c.pass).length; // 0–6

    let label, color;
    if      (score <= 2) { label = 'Weak';   color = '#ef4444'; }
    else if (score === 3) { label = 'Fair';   color = '#f59e0b'; }
    else if (score === 4) { label = 'Good';   color = '#3b82f6'; }
    else                  { label = 'Strong'; color = '#10b981'; }

    return {
        score,
        label,
        color,
        percent: Math.round((score / 6) * 100),
        checks,
        isAcceptable: score >= 4, // must be Good or Strong to submit
    };
}
