import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthWarningBanner } from "./AuthWarningBanner";
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

describe("AuthWarningBanner", () => {
  it("should render for fail aggregate", () => {
    render(
      <AuthWarningBanner
        authResults={makeAuthResults("fail")}
        senderAddress="bad@example.com"
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("Authentication failed")).toBeInTheDocument();
    expect(screen.getByText(/bad@example\.com/)).toBeInTheDocument();
  });

  it("should not render for pass aggregate", () => {
    const { container } = render(
      <AuthWarningBanner
        authResults={makeAuthResults("pass")}
        senderAddress="good@example.com"
        onDismiss={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("should call onDismiss when dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    render(
      <AuthWarningBanner
        authResults={makeAuthResults("fail")}
        senderAddress="bad@example.com"
        onDismiss={onDismiss}
      />,
    );

    const dismissBtn = screen.getByLabelText("Dismiss warning");
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
