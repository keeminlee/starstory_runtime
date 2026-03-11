import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions, assertProductionAuthEnvironment } from "@/lib/server/authOptions";

type AuthRouteContext = {
	params: Promise<{
		nextauth: string[];
	}>;
};

export async function GET(request: NextRequest, context: AuthRouteContext): Promise<Response> {
	assertProductionAuthEnvironment();
	return NextAuth(request, context, authOptions);
}

export async function POST(request: NextRequest, context: AuthRouteContext): Promise<Response> {
	assertProductionAuthEnvironment();
	return NextAuth(request, context, authOptions);
}
