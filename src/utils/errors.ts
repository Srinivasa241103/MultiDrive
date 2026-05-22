export class AppError extends Error{
    constructor(message: string){
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = this.constructor.name;
    }
}

export class ChunkUploadError extends AppError {
    public chunkId?: string
    public provider?: string

    constructor(message: string, options?: {
      chunkId?: string;
      provider?: string;
    }){
        super(message);
        this.chunkId = options?.chunkId;
        this.provider = options?.provider;
    }
}

export class IntegrityError extends AppError{
    public expectedHash: string;
    public actualHash: string;

    constructor(
        message: string,
        expectedHash: string,
        actualHash: string
    ){
        super(message);
        this.expectedHash = expectedHash;
        this.actualHash = actualHash;
    }
}

export class TokenExpiredError extends AppError{
    public provider? : string;

    constructor(message: string, options?: {
        provider?: string;
    }){
        super(message);
        this.provider = options?.provider;
    }
}
export class QuotaExceededError extends AppError {
  public provider?: string;
  public retryAfter?: number;

  constructor(
    message: string,
    options?: {
      provider?: string;
      retryAfter?: number; 
    }
  ) {
    super(message);

    this.provider = options?.provider;
    this.retryAfter = options?.retryAfter;
  }
}
