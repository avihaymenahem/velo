import { beforeEach, describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { AuthBadge } from "./AuthBadge";
import type { AuthResult } from "@/services/gmail/authParser";

function makeAuthResults(aggregate: AuthResult["aggregate"]): string {
  const result: AuthResult = {
    spf: { result: aggregate === "pass" ? "pass" : "fail", detail: null },
    dkim: { result: aggregate === "pass" ? "pass" : "fail", detail: null },
    dmarc: { result: aggregate === "pass" ? "pass" : "fail", detail: null },
    aggregate,
  };
  return JSON.stringify(result);
}

describe("AuthBadge", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("should render ShieldCheck for pass aggregate", () => {
    const { container } = render(
      <AuthBadge authResults={makeAuthResults("pass")} />,
    );

    const badge = container.querySelector("[aria-label='Authentication passed']");
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain("text-success");
  });

  it("should render ShieldX for fail aggregate", () => {
    const { container } = render(
      <AuthBadge authResults={makeAuthResults("fail")} />,
    );

    const badge = container.querySelector("[aria-label='Authentication failed']");
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain("text-danger");
  });

  it("should render nothing for null authResults", () => {
    const { container } = render(<AuthBadge authResults={null} />);

    expect(container.innerHTML).toBe("");
  });

  it("should render ShieldAlert for warning aggregate", () => {
    const { container } = render(
      <AuthBadge authResults={makeAuthResults("warning")} />,
    );

    const badge = container.querySelector("[aria-label='Authentication warning']");
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain("text-warning");
  });

  it("should render ShieldQuestion for unknown aggregate", () => {
    const { container } = render(
      <AuthBadge authResults={makeAuthResults("unknown")} />,
    );

    const badge = container.querySelector("[aria-label='Authentication unknown']");
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain("text-text-tertiary");
  });

  it("localizes authentication labels and tooltip details in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    const { container } = render(
      <AuthBadge authResults={makeAuthResults("pass")} />,
    );

    const badge = screen.getByRole("img", { name: "邮件认证通过" });
    expect(badge).toBeInTheDocument();
    expect(container.querySelector("[aria-label='Authentication passed']")).not.toBeInTheDocument();

    fireEvent.mouseEnter(badge);

    expect(screen.getByText(/SPF：通过/)).toBeInTheDocument();
    expect(screen.getByText(/DKIM：通过/)).toBeInTheDocument();
    expect(screen.getByText(/DMARC：通过/)).toBeInTheDocument();
    expect(screen.queryByText(/SPF: pass/)).not.toBeInTheDocument();
  });
});
