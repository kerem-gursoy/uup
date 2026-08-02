import { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";

/**
 * The last middleware in the stack: turns anything thrown by a route into a JSON
 * reply.
 *
 * Without it Express falls back to its own handler, which answers with an HTML
 * page containing a stack trace and absolute file paths. That is wrong twice
 * over on a public deployment - it discloses internals, and the client parses
 * every reply as JSON, so a real message like "file too large" reached the user
 * as a generic "Request failed". The upload limit was the visible case: multer
 * enforces it correctly, but the rejection never arrived in a form the UI could
 * read.
 */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  // Express requires the four-argument shape to recognise this as an error
  // handler, and delegates if a reply is already on the wire.
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json({ error: "That file is too large. The maximum size is 5MB." });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res
        .status(400)
        .json({ error: "Unexpected file field - upload a single file named 'file'." });
    }
    return res.status(400).json({ error: "That file could not be accepted." });
  }

  // Malformed JSON reaches here from express.json() as a SyntaxError.
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Request body is not valid JSON." });
  }

  console.error("Unhandled error:", err);
  return res.status(500).json({ error: "Internal server error" });
};
