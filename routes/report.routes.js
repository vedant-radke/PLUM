import express from "express";
import multer from "multer";
import { simplifyReport } from "../controllers/report.controller.js";

const router = express.Router();

// Multer Config
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


router.post(
  "/simplify",
  upload.fields([
    { name: "report_file", maxCount: 1 },
    { name: "report_text", maxCount: 1 },
  ]),
  simplifyReport
);

export default router;
