# Chorus — sign up and log in

Sign-up and login for a group chat app, built with React (Vite) and an Express + MySQL API.

- **Sign up** with name, email, phone number and password
- **Log in** with either your email or your phone number, plus password
- Passwords are hashed with bcrypt; login returns a JWT
- Duplicate email or phone is rejected with a clear message
- Phone numbers are normalised, so `98765 43210`, `+91 98765-43210` and `+919876543210` are the same account

## Setup

```bash
npm install
cp .env.example .env   # fill in DB_USER, DB_PASSWORD and JWT_SECRET
```

The database (`DB_NAME`, default `chorus`) and the `users` table are created automatically on first start.

## Run

```bash
npm run dev     # React on http://localhost:5173, API on http://localhost:4000
npm start       # builds the React app and serves everything on http://localhost:4000
```

## API

| Method | Path | Body |
|---|---|---|
| POST | `/api/auth/signup` | `{ name, email, phone, password }` |
| POST | `/api/auth/login` | `{ identifier, password }` (identifier = email or phone) |
