export class NextRequest extends Request {
  nextUrl: URL;

  constructor(input: string | URL | Request, init?: RequestInit) {
    super(input, init);
    const url = input instanceof Request ? input.url : input.toString();
    this.nextUrl = new URL(url);
  }
}

export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit): NextResponse {
    return new NextResponse(JSON.stringify(body), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }
}