# Auto Payer license server (Netlify)

What it does
- The app asks this server if its license key is ON. You can switch a key OFF, set an expiry date and a device limit.
- It counts the phones (devices) per key and the orders each phone paid / got verified, and the ETB paid.
- Nothing else is stored: no PINs, no phone numbers, no names.

## Deploy (about 10 minutes)

1. Put this folder in a GitHub repository (or use the Netlify CLI: `npx netlify-cli deploy --prod`).
   Note: Netlify's plain drag-and-drop does not install the function's package, so use Git or the CLI.
2. Netlify -> Add new site -> Import from Git -> pick the repository. Build command: empty. Publish directory: `public`.
3. Site configuration -> Environment variables -> add `ADMIN_PASSWORD` = a long password only you know. Redeploy.
4. Open `https://YOUR-SITE.netlify.app/` -> enter the password -> New license key.
5. In the Android project, open `app/src/main/res/values/strings.xml` and set
   `license_url` to `https://YOUR-SITE.netlify.app/api/checkin`, then build the app.

## Check it works
- `curl -X POST https://YOUR-SITE.netlify.app/api/checkin -H "content-type: application/json" -d '{"key":"KP-XXXX-XXXX-XXXX","device":"test-device-0001"}'`
  should answer `{"enabled":true,...}` for a valid key.

## Notes
- Counts are what each phone reports, so they are honest only for people who run your app unchanged.
- The data lives in Netlify Blobs (included in the free plan). Dashboard loads every device of every key, which is fine for a few hundred phones.
- `npm test` runs the license rules on your computer (no Netlify needed).
