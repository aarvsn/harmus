# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest `main` | ✅ |
| < 1 month old releases | ✅ |
| Older releases | ❌ |

## Reporting a Vulnerability

**Please do not report security vulnerabilities as public GitHub issues.**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You will receive a response within 48 hours. If the issue is confirmed, we will:

1. Work on a fix in a private branch
2. Coordinate a disclosure timeline with you
3. Release a patch and publish a security advisory

We appreciate responsible disclosure and will credit you in the advisory unless you prefer otherwise.

## Scope

The following are in scope:

- Arbitrary code execution via crafted repository files
- Path traversal escaping the configured `cwd`
- API key exfiltration via tool output
- Privilege escalation in the Discord bot's permission system
- Supply chain issues in dependencies

The following are out of scope:

- Issues requiring physical access to the machine
- Social engineering attacks
- Vulnerabilities in third-party providers (report to them directly)
