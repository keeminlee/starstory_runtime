export class NextRequest extends Request {
  nextUrl: URL;

  constructor(input: string | URL | Request, init?: RequestInit) {
    super(input, init);
    const url = input instanceof Request ? input.url : input.toString();
    this.nextUrl = new URL(url);
  }
}

export class NextResponse extends Response {
  static next(init?: ResponseInit): NextResponse {
    return new NextResponse(null, {
      ...init,
      headers: {
        "x-middleware-next": "1",
        ...(init?.headers ?? {}),
      },
    });
  }

  static redirect(url: string | URL, status = 307): NextResponse {
    return new NextResponse(null, {
      status,
      headers: {
        location: url.toString(),
      },
    });
  }

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
