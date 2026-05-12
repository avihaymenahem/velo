export interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  category: "announcement" | "newsletter" | "promotion" | "follow-up" | "event" | "welcome" | "feedback" | "invoice" | "meeting" | "holiday";
  html: string;
}

export const campaignTemplates: CampaignTemplate[] = [
  {
    id: "welcome",
    name: "Welcome to Our Community",
    description: "Friendly onboarding email with brand header and getting-started CTA",
    category: "welcome",
    html: `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;">
            <h1 style="margin:0;font-size:22px;color:#ffffff;font-weight:700;">Velo</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 0;">
            <h1 style="margin:0;font-size:26px;color:#18181b;font-weight:700;line-height:1.3;">Welcome to Our Community!</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;font-size:15px;color:#3f3f46;line-height:1.7;">
            {{content}}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 32px;">
            <a href="#" style="display:inline-block;background:#6366f1;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:8px;">Get Started →</a>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;background:#fafafa;border-top:1px solid #e4e4e7;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="font-size:12px;color:#a1a1aa;">
                  <p style="margin:0 0 4px;">© 2025 Velo. All rights reserved.</p>
                  <p style="margin:0;"><a href="#" style="color:#6366f1;text-decoration:underline;">Unsubscribe</a></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
  },
  {
    id: "newsletter",
    name: "Monthly Newsletter",
    description: "Clean newsletter layout with featured article and secondary links",
    category: "newsletter",
    html: `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#2563eb;padding:20px 32px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-size:14px;color:#93c5fd;">Monthly Newsletter</td>
                <td align="right" style="font-size:20px;color:#ffffff;font-weight:700;">Velo</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 0;">
            <h1 style="margin:0;font-size:24px;color:#18181b;font-weight:700;line-height:1.3;">This Month's Highlights</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;font-size:15px;color:#3f3f46;line-height:1.7;">
            {{content}}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 32px;">
            <a href="#" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:8px;">Read Full Article →</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="padding-top:16px;border-top:1px solid #e4e4e7;">
                  <a href="#" style="display:block;padding:8px 0;font-size:14px;color:#2563eb;text-decoration:none;">› Product Updates</a>
                  <a href="#" style="display:block;padding:8px 0;font-size:14px;color:#2563eb;text-decoration:none;">› Community Stories</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;text-align:center;">
            <p style="margin:0 0 4px;">© 2025 Velo. All rights reserved.</p>
            <p style="margin:0;"><a href="#" style="color:#2563eb;text-decoration:underline;">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
  },
  {
    id: "promotion",
    name: "Special Offer Just for You",
    description: "Sales and promotion email with discount code and urgency CTA",
    category: "promotion",
    html: `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#1c1917;padding:28px 32px;text-align:center;">
            <h1 style="margin:0;font-size:18px;color:#ffffff;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Limited Time Offer</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 0;text-align:center;">
            <h1 style="margin:0;font-size:28px;color:#18181b;font-weight:800;line-height:1.3;">Special Offer Just for You</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;font-size:15px;color:#3f3f46;line-height:1.7;">
            {{content}}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 16px;">
            <table cellpadding="0" cellspacing="0" border="0" style="background:#fef3c7;border:2px dashed #f59e0b;border-radius:8px;">
              <tr>
                <td style="padding:12px 32px;font-size:22px;font-weight:700;color:#d97706;letter-spacing:3px;">BIG20</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 32px;">
            <a href="#" style="display:inline-block;background:#f59e0b;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 36px;border-radius:8px;">Shop Now →</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;"><strong style="color:#ef4444;">🔥</strong> Offer ends soon. Don't miss out!</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;text-align:center;">
            <p style="margin:0 0 4px;">© 2025 Velo. All rights reserved.</p>
            <p style="margin:0;"><a href="#" style="color:#f59e0b;text-decoration:underline;">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
  },
  {
    id: "follow-up",
    name: "Following Up",
    description: "Professional follow-up after a meeting or call with notes summary",
    category: "follow-up",
    html: `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#27272a;padding:24px 32px;">
            <h1 style="margin:0;font-size:18px;color:#ffffff;font-weight:600;">Velo</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 0;">
            <h1 style="margin:0;font-size:24px;color:#18181b;font-weight:700;line-height:1.3;">Following Up</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;font-size:15px;color:#3f3f46;line-height:1.7;">
            {{content}}
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 16px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;border-radius:8px;">
              <tr>
                <td style="padding:16px;font-size:13px;color:#52525b;">
                  <strong style="color:#18181b;">Meeting Notes:</strong><br>
                  • Discussed project timeline and milestones<br>
                  • Agreed on next steps<br>
                  • Follow-up items assigned
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 32px;">
            <a href="#" style="display:inline-block;background:#27272a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:8px;">Schedule Next Meeting</a>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;text-align:center;">
            <p style="margin:0 0 4px;">© 2025 Velo. All rights reserved.</p>
            <p style="margin:0;"><a href="#" style="color:#27272a;text-decoration:underline;">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
  },
  {
    id: "event",
    name: "You're Invited!",
    description: "Event invitation with date, time, location details and RSVP button",
    category: "event",
    html: `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#059669,#10b981);padding:36px 32px;text-align:center;">
            <p style="margin:0 0 8px;font-size:14px;color:#a7f3d0;text-transform:uppercase;letter-spacing:2px;">You're Invited</p>
            <h1 style="margin:0;font-size:28px;color:#ffffff;font-weight:800;line-height:1.3;">You're Invited!</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 0;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="padding:12px;background:#f0fdf4;border-radius:8px;font-size:14px;color:#065f46;">
                  <strong>Date:</strong> Friday, June 15, 2025<br>
                  <strong>Time:</strong> 6:00 PM – 9:00 PM<br>
                  <strong>Location:</strong> 123 Main St, San Francisco, CA
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;font-size:15px;color:#3f3f46;line-height:1.7;">
            {{content}}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 32px;">
            <a href="#" style="display:inline-block;background:#059669;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:8px;">RSVP Now →</a>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;text-align:center;">
            <p style="margin:0 0 4px;">© 2025 Velo. All rights reserved.</p>
            <p style="margin:0;"><a href="#" style="color:#059669;text-decoration:underline;">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
  },
  {
    id: "announcement",
    name: "Big News!",
    description: "Product launch or company announcement with key highlights",
    category: "announcement",
    html: `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#0284c7,#38bdf8);padding:28px 32px;text-align:center;">
            <p style="margin:0 0 4px;font-size:12px;color:#bae6fd;text-transform:uppercase;letter-spacing:3px;font-weight:600;">Announcement</p>
            <h1 style="margin:0;font-size:28px;color:#ffffff;font-weight:800;line-height:1.2;">Big News!</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 0;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="padding:10px 16px;background:#f0f9ff;border-left:3px solid #0284c7;margin-bottom:8px;font-size:14px;color:#075985;">🚀 New feature release</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;background:#f0f9ff;border-left:3px solid #0284c7;margin-bottom:8px;font-size:14px;color:#075985;">✨ Enhanced user experience</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;background:#f0f9ff;border-left:3px solid #0284c7;font-size:14px;color:#075985;">⚡ Performance improvements</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;font-size:15px;color:#3f3f46;line-height:1.7;">
            {{content}}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 32px;">
            <a href="#" style="display:inline-block;background:#0284c7;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:8px;">Learn More →</a>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;text-align:center;">
            <p style="margin:0 0 4px;">© 2025 Velo. All rights reserved.</p>
            <p style="margin:0;"><a href="#" style="color:#0284c7;text-decoration:underline;">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
  },
  {
    id: "feedback",
    name: "We'd Love Your Feedback",
    description: "Customer feedback and survey request with star rating visual",
    category: "feedback",
    html: `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#e11d48;padding:24px 32px;">
            <h1 style="margin:0;font-size:18px;color:#ffffff;font-weight:600;">Velo</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 0;text-align:center;">
            <h1 style="margin:0;font-size:24px;color:#18181b;font-weight:700;line-height:1.3;">We'd Love Your Feedback</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;text-align:center;">
            <span style="color:#f59e0b;font-size:32px;line-height:1;">★★★★★</span>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 16px;font-size:15px;color:#3f3f46;line-height:1.7;text-align:center;">
            {{content}}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 32px;">
            <a href="#" style="display:inline-block;background:#e11d48;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:8px;">Take Our Survey</a>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;text-align:center;">
            <p style="margin:0 0 4px;">© 2025 Velo. All rights reserved.</p>
            <p style="margin:0;"><a href="#" style="color:#e11d48;text-decoration:underline;">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
  },
  {
    id: "invoice",
    name: "Your Invoice",
    description: "Simple invoice and receipt with line items, totals, and payment CTA",
    category: "invoice",
    html: `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#18181b;padding:24px 32px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-size:20px;color:#ffffff;font-weight:700;">Velo</td>
                <td align="right" style="font-size:12px;color:#a1a1aa;">INV-2025-001</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 0;">
            <h1 style="margin:0;font-size:24px;color:#18181b;font-weight:700;line-height:1.3;">Your Invoice</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr style="background:#f4f4f5;">
                <th style="padding:10px 12px;font-size:12px;color:#52525b;text-align:left;font-weight:600;text-transform:uppercase;">Item</th>
                <th style="padding:10px 12px;font-size:12px;color:#52525b;text-align:right;font-weight:600;text-transform:uppercase;">Amount</th>
              </tr>
              <tr style="border-bottom:1px solid #e4e4e7;">
                <td style="padding:10px 12px;font-size:14px;color:#3f3f46;">Product A</td>
                <td style="padding:10px 12px;font-size:14px;color:#3f3f46;text-align:right;">$49.00</td>
              </tr>
              <tr style="border-bottom:1px solid #e4e4e7;">
                <td style="padding:10px 12px;font-size:14px;color:#3f3f46;">Product B</td>
                <td style="padding:10px 12px;font-size:14px;color:#3f3f46;text-align:right;">$29.00</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;font-size:14px;color:#3f3f46;">Shipping</td>
                <td style="padding:10px 12px;font-size:14px;color:#3f3f46;text-align:right;">$5.00</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 16px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="padding:8px 12px;font-size:16px;font-weight:700;color:#18181b;">Total</td>
                <td align="right" style="padding:8px 12px;font-size:16px;font-weight:700;color:#18181b;">$83.00</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 16px;font-size:15px;color:#3f3f46;line-height:1.7;">
            {{content}}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 32px;">
            <a href="#" style="display:inline-block;background:#18181b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:8px;">Pay Now →</a>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;text-align:center;">
            <p style="margin:0 0 4px;">© 2025 Velo. All rights reserved.</p>
            <p style="margin:0;"><a href="#" style="color:#18181b;text-decoration:underline;">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
  },
  {
    id: "meeting",
    name: "Meeting Confirmed",
    description: "Meeting confirmation with calendar link and preparation checklist",
    category: "meeting",
    html: `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#a78bfa);padding:24px 32px;">
            <h1 style="margin:0;font-size:18px;color:#ffffff;font-weight:600;">Velo</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 0;">
            <h1 style="margin:0;font-size:24px;color:#18181b;font-weight:700;line-height:1.3;">Meeting Confirmed</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f3ff;border-radius:8px;">
              <tr>
                <td style="padding:14px 16px;font-size:14px;color:#5b21b6;">
                  <strong>Date:</strong> Monday, June 10, 2025<br>
                  <strong>Time:</strong> 10:00 AM – 11:00 AM PDT<br>
                  <strong>Duration:</strong> 1 hour
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 16px;font-size:15px;color:#3f3f46;line-height:1.7;">
            {{content}}
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 16px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafafa;border-radius:8px;border:1px solid #e4e4e7;">
              <tr>
                <td style="padding:14px 16px;font-size:13px;color:#52525b;">
                  <strong style="color:#18181b;">Preparation Checklist:</strong><br>
                  ☐ Review agenda and materials<br>
                  ☐ Prepare questions<br>
                  ☐ Test your audio/video setup
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 32px;">
            <a href="#" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:8px;">Add to Calendar</a>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;text-align:center;">
            <p style="margin:0 0 4px;">© 2025 Velo. All rights reserved.</p>
            <p style="margin:0;"><a href="#" style="color:#7c3aed;text-decoration:underline;">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
  },
  {
    id: "holiday",
    name: "Season's Greetings",
    description: "Warm holiday and seasonal greeting with heartfelt message",
    category: "holiday",
    html: `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#991b1b,#dc2626);padding:36px 32px;text-align:center;">
            <p style="margin:0 0 4px;font-size:32px;line-height:1;">🎄✨</p>
            <h1 style="margin:8px 0 0;font-size:26px;color:#ffffff;font-weight:800;line-height:1.3;">Season's Greetings</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 0;text-align:center;">
            <p style="margin:0;font-size:16px;color:#52525b;line-height:1.6;font-style:italic;">
              "The best way to spread Christmas cheer is singing loud for all to hear."
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;font-size:15px;color:#3f3f46;line-height:1.7;text-align:center;">
            {{content}}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 32px;">
            <a href="#" style="display:inline-block;background:#dc2626;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:8px;">Send Warm Wishes →</a>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;text-align:center;border-top:1px solid #e4e4e7;">
            <p style="margin:0;font-size:28px;line-height:1;">❄️⭐❄️</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 20px;font-size:12px;color:#a1a1aa;text-align:center;">
            <p style="margin:0 0 4px;">© 2025 Velo. All rights reserved.</p>
            <p style="margin:0;"><a href="#" style="color:#dc2626;text-decoration:underline;">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
  },
];
