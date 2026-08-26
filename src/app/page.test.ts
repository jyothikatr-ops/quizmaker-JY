import { homeDestination } from "./page";

describe("home page", () => {
	it("redirects visitors to login", () => {
		expect(homeDestination).toBe("/login");
	});
});
