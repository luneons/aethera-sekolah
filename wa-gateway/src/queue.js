/**
 * Message Queue with rate limiting
 *
 * - Sequential processing (no concurrent sends)
 * - Random delay between MIN_DELAY and MAX_DELAY
 * - History tracking for debugging
 * - Auto-retry on failure (max 2 retries)
 */

class MessageQueue {
  constructor(minDelay = 3000, maxDelay = 6000) {
    this.minDelay = minDelay;
    this.maxDelay = maxDelay;
    this.queue = [];
    this.history = [];
    this.processing = false;
    this.processHandler = null;
    this.idCounter = 0;
    this.maxHistory = 100;
    this.maxRetries = 2;
  }

  onProcess(handler) {
    this.processHandler = handler;
  }

  enqueue(item) {
    const id = ++this.idCounter;
    this.queue.push({ ...item, id, retries: 0 });

    // Start processing if not already running
    if (!this.processing) {
      this._processNext();
    }

    return id;
  }

  size() {
    return this.queue.length;
  }

  isProcessing() {
    return this.processing;
  }

  getHistory(limit = 20) {
    return this.history.slice(-limit);
  }

  async _processNext() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const item = this.queue.shift();

    try {
      const result = await this.processHandler(item);

      this.history.push({
        id: item.id,
        phone: item.phone,
        status: result.success ? 'sent' : 'failed',
        error: result.error || null,
        processedAt: new Date().toISOString(),
        addedAt: item.addedAt,
      });

      // Retry on failure
      if (!result.success && item.retries < this.maxRetries) {
        item.retries++;
        this.queue.unshift(item); // Put back at front
        console.log(`🔄 Retry ${item.retries}/${this.maxRetries} for ${item.phone}`);
      }
    } catch (err) {
      this.history.push({
        id: item.id,
        phone: item.phone,
        status: 'error',
        error: err.message,
        processedAt: new Date().toISOString(),
        addedAt: item.addedAt,
      });
    }

    // Trim history
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    // Wait random delay before next message
    const delay = this._randomDelay();
    console.log(`⏳ Next message in ${(delay / 1000).toFixed(1)}s (queue: ${this.queue.length})`);
    await this._sleep(delay);

    // Process next
    this._processNext();
  }

  _randomDelay() {
    // Random delay between min and max, with slight gaussian-like distribution
    const range = this.maxDelay - this.minDelay;
    const random = (Math.random() + Math.random()) / 2; // Tends toward center
    return Math.floor(this.minDelay + range * random);
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = { MessageQueue };
