import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ButtonLoader } from "./ui";

describe("button loader", () => {
  it("renders a fixed-size decorative loading indicator", () => {
    const markup = renderToStaticMarkup(<ButtonLoader size={18} />);

    expect(markup).toContain('class="lucide lucide-loader-circle button-loader"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('width="18"');
    expect(markup).toContain('height="18"');
  });
});
