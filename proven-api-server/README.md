# Proven Backend

This project is a small TypeScript/Express backend using Prisma ORM.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Environment variables**
   - Create a `.env` file in the project root with the following variables:
     - `DATABASE_URL` – connection string for your database
     - `PORT` – port for the server (defaults to 3001)
     - `NODE_ENV` – `development` or `production`
     - `NEXTAUTH_SECRET` – secret used to sign JWT tokens
3. **Run Prisma migrations**
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```
4. **Start the server**
   ```bash
   npm start
   ```

During development you can use:
```bash
npm run dev
```
which runs the server with automatic reload using `nodemon`.

## Scripts
- `npm start` – compile TypeScript and run the compiled code
- `npm run build` – generate JavaScript into the `dist` folder
- `npm run dev` – start the server with `ts-node` and `nodemon`

## API Endpoints
The main routes are available under `/api`:
- `/auth` – authentication endpoints
- `/users` – user profile operations
- `/challenges` – challenge management
- `/transactions` – transaction history

## License
This project is licensed under the MIT License.
