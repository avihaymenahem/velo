import type { QuickStepAction, QuickStepActionType } from "./types";

interface QuickStepDisplaySource {
  name: string;
  actions_json: string;
}

interface DefaultQuickStepDisplayRule {
  name: string;
  actions: QuickStepActionType[];
  translationKey: string;
}

type QuickStepDisplayTranslator = (
  key: string,
  options?: { defaultValue: string },
) => string;

const DEFAULT_DISPLAY_RULES: DefaultQuickStepDisplayRule[] = [
  {
    name: "Reply & Archive",
    actions: ["reply", "archive"],
    translationKey: "editors.quickSteps.presets.replyArchive",
  },
  {
    name: "Mark Read & Archive",
    actions: ["markRead", "archive"],
    translationKey: "editors.quickSteps.presets.markReadArchive",
  },
  {
    name: "Star & Pin",
    actions: ["star", "pin"],
    translationKey: "editors.quickSteps.presets.starPin",
  },
];

export function getQuickStepDisplayName(
  quickStep: QuickStepDisplaySource,
  t: QuickStepDisplayTranslator,
): string {
  const matchingRule = DEFAULT_DISPLAY_RULES.find((rule) =>
    quickStep.name === rule.name && hasExactActionChain(quickStep.actions_json, rule.actions),
  );

  if (!matchingRule) return quickStep.name;
  return t(matchingRule.translationKey, { defaultValue: quickStep.name });
}

function hasExactActionChain(actionsJson: string, expectedTypes: QuickStepActionType[]): boolean {
  let actions: QuickStepAction[];
  try {
    actions = JSON.parse(actionsJson) as QuickStepAction[];
  } catch {
    return false;
  }

  if (actions.length !== expectedTypes.length) return false;
  return actions.every((action, index) =>
    action.type === expectedTypes[index] && !action.params,
  );
}
