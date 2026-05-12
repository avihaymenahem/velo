import { describe, it, expect } from "vitest";
import { evaluateConditionalBlocks } from "./templateVariables";

describe("evaluateConditionalBlocks", () => {
  it("renders {{#if company}} branch when company is set (preserving other variables)", () => {
    const template = "{{#if company}}Hello {{company}}{{/if}}";
    const result = evaluateConditionalBlocks(template, { company: "Acme Corp" });
    expect(result).toBe("Hello {{company}}");
  });

  it("uses {{else}} fallback when var is not set", () => {
    const template = "{{#if company}}Hello {{company}}{{else}}Hello there{{/if}}";
    const result = evaluateConditionalBlocks(template, {});
    expect(result).toBe("Hello there");
  });

  it("uses {{else}} fallback when var is empty string", () => {
    const template = "{{#if name}}Hi {{name}}{{else}}Hi there{{/if}}";
    const result = evaluateConditionalBlocks(template, { name: "" });
    expect(result).toBe("Hi there");
  });

  it("uses {{else}} fallback when var is whitespace only", () => {
    const template = "{{#if name}}Hi {{name}}{{else}}Hi there{{/if}}";
    const result = evaluateConditionalBlocks(template, { name: "   " });
    expect(result).toBe("Hi there");
  });

  it("renders empty when no var set and no else branch", () => {
    const template = "{{#if company}}Hello {{company}}{{/if}}";
    const result = evaluateConditionalBlocks(template, {});
    expect(result).toBe("");
  });

  it("handles multiple conditional blocks", () => {
    const template = "{{#if name}}Hi {{name}}{{/if}}, {{#if company}}from {{company}}{{/if}}";
    const result = evaluateConditionalBlocks(template, { name: "Alice", company: "Acme" });
    expect(result).toBe("Hi {{name}}, from {{company}}");
  });

  it("returns template unchanged when no conditional blocks exist", () => {
    const template = "Hello {{name}}";
    const result = evaluateConditionalBlocks(template, { name: "Bob" });
    expect(result).toBe("Hello {{name}}");
  });

  it("preserves un-interpolated variables inside if blocks", () => {
    const template = "{{#if name}}Dear {{name}}, welcome to {{company}}{{/if}}";
    const result = evaluateConditionalBlocks(template, { name: "Alice", company: "Acme" });
    expect(result).toContain("{{name}}");
    expect(result).toContain("{{company}}");
  });

  it("respects only the conditional variable, not other vars in the condition", () => {
    const template = "{{#if name}}Has name{{else}}No name{{/if}}";
    const result = evaluateConditionalBlocks(template, { company: "Acme" });
    expect(result).toBe("No name");
  });
});
