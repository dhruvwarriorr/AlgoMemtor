import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "core-api" });
});

app.listen(port, () => {
  console.log(`Core API listening on http://localhost:${port}`);
});
