import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { authRouter } from "./routes/auth.js";
import { storeRouter } from "./routes/store.js";
import { storePostRouter } from "./routes/post.js";
import { metadataRouter } from "./routes/metadata.js";
import { pieceRouter } from "./routes/piece.js";
import { collectionRouter } from "./routes/collection.js";
import { measurementRouter } from "./routes/measurement.js";
import { inquiryRouter } from "./routes/inquiry.js";
import { quotationRouter } from "./routes/quotation.js";
import { closetRouter } from "./routes/closet.js";
import { orderRouter } from "./routes/order.js";
import { chatRouter } from "./routes/chat.js";
import { notificationRouter } from "./routes/notification.js";
import { reviewRouter } from "./routes/review.js";


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// HTTP Latency Tracing Middleware
app.use((req: any, res: any, next: any) => {
  const start = performance.now();
  res.on("finish", () => {
    const elapsed = performance.now() - start;
    console.log(`[HTTP REQUEST] ${req.method} ${req.originalUrl} -> HTTP ${res.statusCode} (${elapsed.toFixed(2)}ms)`);
  });
  next();
});

// Parse JSON and urlencoded request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger Configuration
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Beviks API Swagger Documentation",
      version: "1.0.0",
      description: "API for Beviks Ltd registering Customers and Designers, managing storefronts, and handling verifications.",
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: "Development server",
      },
    ],
  },
  // Document endpoints across both raw source code files and compiled output directories
  apis: ["./src/routes/*.ts", "./dist/routes/*.js"],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

// Serve Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Mount Routes
app.use("/api/auth", authRouter);
app.use("/api/stores", storeRouter);
app.use("/api/posts", storePostRouter);
app.use("/api/metadata", metadataRouter);
app.use("/api", pieceRouter);
app.use("/api", collectionRouter);
app.use("/api/measurements", measurementRouter);
app.use("/api", inquiryRouter);
app.use("/api", quotationRouter);
app.use("/api", closetRouter);
app.use("/api", orderRouter);
app.use("/api", chatRouter);
app.use("/api", notificationRouter);
app.use("/api", reviewRouter);

// Home route to redirect to API Docs
app.get("/", (req, res) => {
  res.redirect("/api-docs");
});

export { app };
