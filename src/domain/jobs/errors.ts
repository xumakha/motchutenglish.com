/**
 * A job failure that must not be retried (e.g. an analytics event older than GA4 accepts).
 * The worker marks the job failed at once instead of backing off (fix 24).
 */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}
