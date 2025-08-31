# Security Guidelines

## 🔒 API Key Security

### ✅ DO:
- Store API keys in VS Code's secure secrets storage (`context.secrets`)
- Use environment variables for local development
- Use `.env` files for local testing (already gitignored)
- Validate API key format before storing
- Use placeholder text in UI prompts (e.g., "pplx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")

### ❌ DON'T:
- Never hardcode API keys in source code
- Never commit API keys to version control
- Never log API keys to console or files
- Never include API keys in error messages
- Never store API keys in plain text files

## 🛡️ Security Checklist

Before committing code, ensure:

- [ ] No hardcoded API keys in source files
- [ ] No API keys in console.log statements
- [ ] No API keys in error messages
- [ ] Test files are properly gitignored
- [ ] Environment files (.env) are gitignored
- [ ] API keys are stored securely (VS Code secrets)

## 🔍 Security Scanning

### GitGuardian Integration
This repository is monitored by GitGuardian for exposed secrets. If you receive a security alert:

1. **Immediate Action Required**:
   - Remove the exposed secret from the codebase
   - Revoke the compromised API key
   - Generate a new API key
   - Update any systems using the old key

2. **Prevention**:
   - Review the security guidelines above
   - Use the provided setup scripts for testing
   - Never commit test files with real API keys

## 🧪 Testing Safely

### For Development Testing:
```bash
# Use the setup script
node setup-test-env.js

# Or set environment variables manually
export PERPLEXITY_API_KEY="your-key-here"
```

### For CI/CD Testing:
- Use repository secrets/environment variables
- Never hardcode test API keys
- Use dedicated test API keys with limited permissions

## 📞 Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** create a public issue
2. **DO** contact the maintainers privately
3. **DO** provide detailed information about the vulnerability
4. **DO** suggest fixes if possible

## 🔄 Regular Security Reviews

- Monthly: Review all API key usage
- Quarterly: Audit security practices
- Annually: Update security guidelines

---

**Remember**: Security is everyone's responsibility. When in doubt, ask before committing sensitive information.
