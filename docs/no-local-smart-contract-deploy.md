# Aura Protocol smart-contract deployment without installing tools locally

If you do not want Solana, Anchor, Rust, or MSYS2 toolchains installed on your computer, use a remote build/deploy environment.

## Recommended path: GitHub Codespaces

1. Push this project to a private GitHub repository.
2. Open the repository in GitHub Codespaces.
3. Install Solana + Anchor inside Codespaces only.
4. Upload or create a devnet deploy wallet inside Codespaces secrets/storage.
5. Run:

```bash
anchor keys sync
anchor build
anchor deploy --provider.cluster devnet
```

After deployment, copy only the program id back into `.env`:

```bash
AURA_CHAIN_MODE=solana
AURA_SOLANA_RPC_URL=https://api.devnet.solana.com
AURA_PROGRAM_ID=<deployed-program-id>
AURA_WALLET_KEYPAIR=<server-wallet-path-on-deploy-machine>
```

Nothing heavy needs to stay on the local PC.

## Alternative path: CI deployment runner

Use a GitHub Actions workflow or a rented Linux VPS as the deploy runner.

High-level flow:

1. Store the deploy wallet as an encrypted secret.
2. CI installs Solana + Anchor.
3. CI builds the Anchor program.
4. CI deploys to devnet.
5. CI prints the deployed program id.
6. The backend uses that program id for chain sync.

This is cleaner for production because every deploy is repeatable and logged.

This project includes a manual GitHub Actions workflow:

```text
.github/workflows/deploy-anchor-devnet.yml
```

To use it:

1. Push the workflow to GitHub.
2. In the GitHub repo, open **Settings -> Secrets and variables -> Actions**.
3. Add repository secret `SOLANA_DEPLOY_KEYPAIR`.
4. The secret value must be the full JSON array from a devnet Solana keypair file.
5. Open **Actions -> Deploy Anchor Program to Devnet -> Run workflow**.
6. After it finishes, copy the program id from `anchor keys list`.

## Alternative path: Solana Playground

For fast demo deploys, paste the Anchor program into Solana Playground, connect a devnet wallet, build, and deploy. This is fastest, but less professional than Codespaces/CI for a client project.

## What I need from you for remote deployment

Do not paste private keys in chat.

Give me:

- GitHub repo URL if you want Codespaces/CI.
- Devnet RPC URL.
- Public deploy wallet address.
- Whether you want devnet first or test validator first.
- After deploy, the deployed program id.

Private key should be added only to the remote environment secret manager, not into the website, not into chat, and not into committed files.
