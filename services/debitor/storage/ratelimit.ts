import { Request, Response, NextFunction } from "express";

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

export class DebitorRateLimiter {
  private static ipMap: Map<string, RateLimitInfo> = new Map();
  
  // Configurable limits (by default: max 100 API requests per minute)
  private static limitWindowMs = 60000; // 1 minute
  private static maxRequests = 100;

  /**
   * Express middleware to enforce rate limits
   */
  public static handle(req: Request, res: Response, next: NextFunction) {
    const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "anonymous";
    const now = Date.now();

    let clientLimit = DebitorRateLimiter.ipMap.get(ip);

    if (!clientLimit || now > clientLimit.resetTime) {
      // Create or reset sliding window
      clientLimit = {
        count: 1,
        resetTime: now + DebitorRateLimiter.limitWindowMs,
      };
      DebitorRateLimiter.ipMap.set(ip, clientLimit);
    } else {
      clientLimit.count++;
    }

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", DebitorRateLimiter.maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, DebitorRateLimiter.maxRequests - clientLimit.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(clientLimit.resetTime / 1000));

    if (clientLimit.count > DebitorRateLimiter.maxRequests) {
      console.warn(`[RATE LIMIT EXCEEDED] IP ${ip} har overskredet grænsen på ${DebitorRateLimiter.maxRequests} anmodninger/min.`);
      return res.status(429).json({
        success: false,
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Du har foretaget for mange anmodninger på kort tid. Prøv igen om et øjeblik.",
          retryable: true,
        },
      });
    }

    next();
  }

  /**
   * Method to configure limits dynamically based onSettings
   */
  public static configure(maxRequests: number, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.limitWindowMs = windowMs;
  }
}
