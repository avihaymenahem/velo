import { describe, it, expect } from "vitest";
import { interpolateVariablesSync, TEMPLATE_VARIABLES } from "./templateVariables";

describe("templateVariables", () => {
  describe("TEMPLATE_VARIABLES", () => {
    it("should have 8 variables defined", () => {
      expect(TEMPLATE_VARIABLES).toHaveLength(8);
    });

    it("should have unique keys", () => {
      const keys = TEMPLATE_VARIABLES.map((v) => v.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe("interpolateVariablesSync", () => {
    it("should return unchanged html when no variables present", () => {
      const html = "<p>Hello world</p>";
      const result = interpolateVariablesSync(html, {});
      expect(result).toBe(html);
    });

    it("should replace first_name and last_name", () => {
      const html = "Hi {{first_name}} {{last_name}}!";
      const result = interpolateVariablesSync(html, {
        recipientName: "John Doe",
      });
      expect(result).toBe("Hi John Doe!");
    });

    it("should replace email variable", () => {
      const html = "Contact: {{email}}";
      const result = interpolateVariablesSync(html, {
        recipientEmail: "john@example.com",
      });
      expect(result).toBe("Contact: john@example.com");
    });

    it("should replace my_name and my_email", () => {
      const html = "From {{my_name}} ({{my_email}})";
      const result = interpolateVariablesSync(html, {
        senderName: "Alice Smith",
        senderEmail: "alice@example.com",
      });
      expect(result).toBe("From Alice Smith (alice@example.com)");
    });

    it("should replace subject", () => {
      const html = "Re: {{subject}}";
      const result = interpolateVariablesSync(html, {
        subject: "Meeting Tomorrow",
      });
      expect(result).toBe("Re: Meeting Tomorrow");
    });

    it("should replace date and day variables", () => {
      const html = "Today is {{day}}, {{date}}";
      const result = interpolateVariablesSync(html, {});
      // Just verify they were replaced (not empty)
      expect(result).not.toContain("{{day}}");
      expect(result).not.toContain("{{date}}");
    });

    it("should handle missing context gracefully with empty strings", () => {
      const html = "Dear {{first_name}}, from {{my_name}} <{{my_email}}>";
      const result = interpolateVariablesSync(html, {});
      expect(result).toBe("Dear , from  <>");
    });

    it("should handle multi-word last names", () => {
      const html = "{{first_name}} {{last_name}}";
      const result = interpolateVariablesSync(html, {
        recipientName: "Mary Jane Watson",
      });
      expect(result).toBe("Mary Jane Watson");
    });

    it("should handle single name (no last name)", () => {
      const html = "{{first_name}} {{last_name}}";
      const result = interpolateVariablesSync(html, {
        recipientName: "Madonna",
      });
      expect(result).toBe("Madonna ");
    });

    it("should replace multiple occurrences of the same variable", () => {
      const html = "{{first_name}} and {{first_name}} again";
      const result = interpolateVariablesSync(html, {
        recipientName: "John Doe",
      });
      expect(result).toBe("John and John again");
    });
  });
});
