# vDocs for Obsidian

Open your encrypted [vDocs](https://alabz.co.uk) vault inside Obsidian. Your private documents stay encrypted on disk, and a PIN opens them on each device.

## How it works

- Put your `Vault.vdocs` file inside your Obsidian vault (move it there, with its `Vault.vdocs-photos` folder if it has one, then open it in the vDocs app with **Settings → Open another vault**).
- In Obsidian, open **vDocs** from the ribbon or the command palette. The first time on each device, type your vDocs password (or your recovery key), then choose a PIN. From then on the PIN opens it.
- Read, write and organise text documents: headings, bold, italic, lists, checklists and quotes. Your folders from vDocs show in the sidebar. New documents go in the folder you've selected.
- Move documents to the Bin and restore them. Emptying the Bin is done in the vDocs app.
- **Export as .vdoc:** save one document as its own encrypted file with a password just for it (and an optional hint), to send to someone. **Open a .vdoc** reads one back and can add it to your vault. Same format as the vDocs app, so they open in either.
- **Backgrounds:** Static Aurora (follows the Static Aurora theme's live colours), Dusk, Northern lights, or your own picture from your vault, with glow and darken.
- Locks when you leave vDocs for another note (you can switch that off).
- It uses your Obsidian theme. Pictures already in a document still show; adding pictures, galleries, sounds and focus tools stay in the vDocs app.

## Saving

Your changes save straight into `Vault.vdocs`, encrypted. Each save rebuilds the vault file in full (every document, photo and setting in it is kept), checks the new file reads back correctly, and only then puts it in place. If anything else changed the vault since it was opened, it reads that first, so nothing is written over.

On a PC, while the vDocs app has the vault open, Windows won't let the file be replaced. The plugin then says so and keeps your changes, encrypted, on this device; they save as soon as you close the app. The app picks up what you wrote in Obsidian next time it opens the vault.

## Security

- The same encryption as the vDocs app: every document is AES-256-GCM, and the vault's key is locked with your password and your recovery key using scrypt (N = 2^17, r = 8, p = 1).
- On each device, after you unlock with your password, the key is locked again with your PIN plus a random device key that's kept on that device only. It isn't in your vault, so it never syncs. Five wrong PINs and that device forgets the key, and you need your password or recovery key again.
- vDocs locks itself after you've been away from Obsidian for a while (5 minutes unless you change it), and with **Lock vDocs now**.
- No network connections, no tracking.

## Syncing to your phone

If you use Obsidian Sync, turn on **Sync all other types** so `.vdocs` and `.vdj` files sync too.

## Licence

[GNU AGPL v3 or later](LICENSE) © AshOtis
