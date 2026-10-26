# Convention Inventory App

A mobile-friendly app for requesting, checking out and returning circuit
assembly and convention equipment.

**Live site:** https://convention-inventory-app.vercel.app

---

## What the app does

**For requesters (no login needed)**
- Fill in request details (name, phone, event, circuit, dates).
- Browse or search the catalog by category and pick items.
- Submit the request and get a confirmation email.
- Check on an existing order with "Already started or submitted an order?"

**For volunteers (Admin tab, login required)**

Volunteers sign in with a password plus a 6-digit code emailed to them.
Each volunteer only sees the sections their permissions allow:

| Section | What it's for |
|---|---|
| Catalog | Add, edit or delete items and their photos |
| Orders | Review new requests and assign who fills them |
| Returns | Check returned items back in |
| Break/Fix & Projects | Track broken, missing or to-do items and assign them |
| History | Past orders |
| QR Codes | Print QR labels for items |
| Print Lists | Printable lists to use if the app is unavailable |
| Volunteers | Add volunteers and set their permissions |

**Automatic emails**, sent at each step: request submitted, needs review,
assigned to fill, ready for pickup, returned, Break/Fix assignment, login
codes and password resets.

---

## The accounts behind the app

The app depends on four separate services. **Each one has its own owner
and login.** Moving the GitHub project to a new owner does **not** move the
others, so each needs to be shared or transferred on its own.

| Service | What it does | Name in that service |
|---|---|---|
| **GitHub** | Stores the code | `johnybeauford/convention-inventory-app` |
| **Firebase** (Google) | Stores all data: items, orders, volunteers, Break/Fix | project `jw-inventory-mgr` |
| **Vercel** | Runs the website and the email/password functions | `convention-inventory-app` |
| **Resend** | Sends the emails, from `alerts@notify.jw-inventory.com` | domain `notify.jw-inventory.com` |

The domain `jw-inventory.com` is also registered somewhere (a domain
registrar) and must be renewed to keep emails working.

**To give someone access:**
- **Firebase:** console.firebase.google.com → project → gear icon →
  *Users and permissions* → *Add member* → role **Owner**. Only someone
  who already has access can do this.
- **Vercel:** project → *Settings* → *Members*, or transfer the project.
- **Resend:** *Settings* → *Team* → invite.

---

## How changes go live

Saving a change to the `main` branch on GitHub automatically updates the
live website within a few minutes (through Vercel). **There is no
separate "publish" step**, so test changes before saving them to `main`.

**Changes to data are different:** anything added, edited or deleted in
the app (including a copy running on your own computer) changes the real
shared data immediately.

---

## Settings ("environment variables")

**In Vercel** (*Settings → Environment Variables*):

| Name | Where to get it |
|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Firebase → Project settings → *Your apps*. These are also visible in the live website's code, so they aren't secret. |
| `RESEND_API_KEY` | Resend → *API Keys*. **This one is secret.** |

**On your own computer:** copy `.env.example` to `.env` and fill in the six
`VITE_FIREBASE_*` values. `.env` is never uploaded to GitHub. Emails won't
send when running locally.

---

## Running it on your own computer

You need [Node.js](https://nodejs.org) (version 18 or newer).

```bash
npm install
npm run dev
```

Then open the `localhost` address it prints. Remember: this uses the real
shared data.

---

## Security to-do

The original setup put the Firebase database in **test mode**, which lets
anyone who knows the project name read or change the data. Someone with
Firebase access should check *Firestore Database → Rules* and tighten
them, or confirm they already have been.

---

## Where things are in the code

```
api/                  Server functions run by Vercel
  notify-*.js           Each sends one kind of email via Resend
  hash-password.js      Stores volunteer passwords safely
  verify-password.js    Checks a volunteer's password at login
src/
  App.jsx               Main screen, tabs and request flow
  useInventory.js       Reads and saves data in Firebase
  firebase.js           Connects to Firebase using the .env values
  seedData.js           The original 73 starter items, with photos
  components/           Each screen and pop-up (AdminHub.jsx = Admin tab)
```
