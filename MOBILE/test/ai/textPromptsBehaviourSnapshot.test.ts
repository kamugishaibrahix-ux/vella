/**
 * Phase 1 — Prompt builder behaviour snapshot injection tests.
 */
import { describe, it, expect } from "vitest";
import { buildVellaTextPrompt } from "@/lib/ai/textPrompts";
import type { BehaviourSnapshot } from "@/lib/governance/behaviourSnapshot";
import type { GuidanceSignals } from "@/lib/governance/guidance";
import type { IdentitySignals } from "@/lib/ai/identityEngine";
import type { ValueAlignmentSignals } from "@/lib/governance/valueAlignment";

describe("buildVellaTextPrompt with behaviourSnapshot", () => {
  it("includes BEHAVIOURAL SNAPSHOT section when snapshot provided", () => {
    const snapshot: BehaviourSnapshot = {
      riskScore: 2,
      escalationLevel: 0,
      recoveryState: "ok",
      disciplineState: "on_track",
      focusState: "active",
      recentCommitmentViolations: 0,
      recentAbstinenceViolations: 0,
      focusSessionsLast7d: 1,
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      boundaryTriggered: false,
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Hi",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    expect(prompt).toContain("BEHAVIOURAL SNAPSHOT (Structured Data — Do Not Repeat Verbosely)");
    expect(prompt).toContain(JSON.stringify(snapshot));
  });

  it("includes snapshot keys in structured JSON", () => {
    const snapshot: BehaviourSnapshot = {
      riskScore: 5,
      escalationLevel: 1,
      recoveryState: "at_risk",
      disciplineState: "slipping",
      focusState: "idle",
      recentCommitmentViolations: 2,
      recentAbstinenceViolations: 1,
      focusSessionsLast7d: 0,
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      boundaryTriggered: false,
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Hello",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    expect(prompt).toContain('"riskScore":5');
    expect(prompt).toContain('"recentCommitmentViolations":2');
    expect(prompt).toContain('"recentAbstinenceViolations":1');
    expect(prompt).toContain('"focusSessionsLast7d":0');
  });

  it("omits BEHAVIOURAL SNAPSHOT section when snapshot not provided", () => {
    const prompt = buildVellaTextPrompt({
      userMessage: "Hi",
      language: "en",
    });
    expect(prompt).not.toContain("BEHAVIOURAL SNAPSHOT");
    expect(prompt).toContain("User said:");
  });

  it("Phase 2: when contradictionDetected is true, adds commitment contradiction instruction", () => {
    const snapshot: BehaviourSnapshot = {
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      recentCommitmentViolations: 0,
      recentAbstinenceViolations: 0,
      focusSessionsLast7d: 0,
      contradictionDetected: true,
      contradictedCommitmentIds: ["c1"],
      boundaryTriggered: false,
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Test",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    expect(prompt).toContain("COMMITMENT CONTRADICTION");
    expect(prompt).toContain("User statement conflicts with an active commitment");
    expect(prompt).toContain("Surface the inconsistency calmly");
    expect(prompt).toContain("Do not accuse");
    expect(prompt).toContain("Ask clarifying questions first");
  });

  it("Phase 2: when contradictionDetected is false, instruction block not present", () => {
    const snapshot: BehaviourSnapshot = {
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      recentCommitmentViolations: 0,
      recentAbstinenceViolations: 0,
      focusSessionsLast7d: 0,
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      boundaryTriggered: false,
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Test",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    expect(prompt).not.toContain("COMMITMENT CONTRADICTION");
    expect(prompt).not.toContain("User statement conflicts with an active commitment");
  });

  it("does not log or include verbose narrative for snapshot", () => {
    const snapshot: BehaviourSnapshot = {
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      recentCommitmentViolations: 0,
      recentAbstinenceViolations: 0,
      focusSessionsLast7d: 0,
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      boundaryTriggered: false,
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Test",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    const snapshotBlock = prompt.slice(
      prompt.indexOf("BEHAVIOURAL SNAPSHOT"),
      prompt.indexOf("User said:")
    );
    expect(snapshotBlock).toContain(JSON.stringify(snapshot));
    expect(snapshotBlock.split("\n").length).toBeLessThanOrEqual(10);
  });

  it("Phase 3: when boundaryTriggered is true, adds boundary instruction block before User said", () => {
    const snapshot: BehaviourSnapshot = {
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      recentCommitmentViolations: 0,
      recentAbstinenceViolations: 0,
      focusSessionsLast7d: 0,
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      boundaryTriggered: true,
      boundaryType: "insult",
      boundarySeverity: 1,
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Test",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    expect(prompt).toContain("BOUNDARY & RESPECT");
    expect(prompt).toContain("disrespectful language");
    expect(prompt).toContain("Set a calm boundary");
    expect(prompt).toContain("Ask what led them to say it");
    expect(prompt).toContain("Do not retaliate");
    const boundaryIdx = prompt.indexOf("BOUNDARY & RESPECT");
    const userSaidIdx = prompt.indexOf("User said:");
    expect(boundaryIdx).toBeLessThan(userSaidIdx);
  });

  it("Phase 3: when boundaryTriggered is false, boundary block not present", () => {
    const snapshot: BehaviourSnapshot = {
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      recentCommitmentViolations: 0,
      recentAbstinenceViolations: 0,
      focusSessionsLast7d: 0,
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      boundaryTriggered: false,
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Test",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    expect(prompt).not.toContain("BOUNDARY & RESPECT");
    expect(prompt).not.toContain("disrespectful language");
  });

  it("Phase 4: when guidanceSignals exists, adds GUIDANCE SIGNALS block after snapshot before User said", () => {
    const guidanceSignals: GuidanceSignals = {
      firmnessLevel: 2,
      earnedValidation: { earnedValidationLevel: 1, reasons: [] },
      outcomeProjection: { projectionLevel: 1, messageStyle: "gentle", reasons: [] },
    };
    const snapshot: BehaviourSnapshot = {
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      recentCommitmentViolations: 0,
      recentAbstinenceViolations: 0,
      focusSessionsLast7d: 0,
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      boundaryTriggered: false,
      guidanceSignals,
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Test",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    expect(prompt).toContain("GUIDANCE SIGNALS (Structured — Use to Adjust Tone)");
    expect(prompt).toContain("firmnessLevel");
    expect(prompt).toContain("earnedValidationLevel");
    expect(prompt).toContain("Never shame");
    const snapshotIdx = prompt.indexOf("BEHAVIOURAL SNAPSHOT");
    const guidanceIdx = prompt.indexOf("GUIDANCE SIGNALS");
    const userSaidIdx = prompt.indexOf("User said:");
    expect(snapshotIdx).toBeLessThan(guidanceIdx);
    expect(guidanceIdx).toBeLessThan(userSaidIdx);
  });

  it("Phase 4: when guidanceSignals is absent, GUIDANCE SIGNALS block not present", () => {
    const snapshot: BehaviourSnapshot = {
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      recentCommitmentViolations: 0,
      recentAbstinenceViolations: 0,
      focusSessionsLast7d: 0,
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      boundaryTriggered: false,
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Test",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    expect(prompt).not.toContain("GUIDANCE SIGNALS (Structured — Use to Adjust Tone)");
  });

  it("Phase 4: guidance block contains firmnessLevel and earnedValidationLevel numbers, no long narrative", () => {
    const guidanceSignals: GuidanceSignals = {
      firmnessLevel: 3,
      earnedValidation: { earnedValidationLevel: 2, reasons: ["CONSISTENT_COMPLETIONS_7D"] },
      outcomeProjection: { projectionLevel: 2, messageStyle: "gentle", reasons: ["REPEATED_VIOLATIONS_7D"] },
    };
    const snapshot: BehaviourSnapshot = {
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      recentCommitmentViolations: 0,
      recentAbstinenceViolations: 0,
      focusSessionsLast7d: 0,
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      boundaryTriggered: false,
      guidanceSignals,
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Test",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    expect(prompt).toContain('"firmnessLevel":3');
    expect(prompt).toContain('"earnedValidationLevel":2');
    const guidanceSection = prompt.slice(
      prompt.indexOf("GUIDANCE SIGNALS"),
      prompt.indexOf("User said:")
    );
    expect(guidanceSection.length).toBeLessThan(800);
  });

  it("Phase 5: when identitySignals exists, adds IDENTITY SIGNALS block after Guidance before User said", () => {
    const identitySignals: IdentitySignals = {
      mood: "calm",
      stance: "soft_support",
      standardsLevel: 0,
      reasons: [],
    };
    const snapshot: BehaviourSnapshot = {
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      recentCommitmentViolations: 0,
      recentAbstinenceViolations: 0,
      focusSessionsLast7d: 0,
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      boundaryTriggered: false,
      guidanceSignals: {
        firmnessLevel: 0,
        earnedValidation: { earnedValidationLevel: 0, reasons: [] },
        outcomeProjection: { projectionLevel: 0, messageStyle: "gentle", reasons: [] },
      },
      identitySignals,
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Test",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    expect(prompt).toContain("IDENTITY SIGNALS (Structured — Do Not Roleplay)");
    expect(prompt).toContain("Do Not Roleplay");
    expect(prompt).toContain('"mood":"calm"');
    expect(prompt).toContain('"stance":"soft_support"');
    const guidanceIdx = prompt.indexOf("GUIDANCE SIGNALS");
    const identityIdx = prompt.indexOf("IDENTITY SIGNALS");
    const userSaidIdx = prompt.indexOf("User said:");
    expect(guidanceIdx).toBeLessThan(identityIdx);
    expect(identityIdx).toBeLessThan(userSaidIdx);
  });

  it("Phase 5: when identitySignals is absent, IDENTITY SIGNALS block not present", () => {
    const snapshot: BehaviourSnapshot = {
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      recentCommitmentViolations: 0,
      recentAbstinenceViolations: 0,
      focusSessionsLast7d: 0,
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      boundaryTriggered: false,
      guidanceSignals: {
        firmnessLevel: 0,
        earnedValidation: { earnedValidationLevel: 0, reasons: [] },
        outcomeProjection: { projectionLevel: 0, messageStyle: "gentle", reasons: [] },
      },
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Test",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    expect(prompt).not.toContain("IDENTITY SIGNALS (Structured — Do Not Roleplay)");
  });

  it("Phase 5: identity block contains Do NOT guilt-trip or seek reassurance", () => {
    const identitySignals: IdentitySignals = {
      mood: "firm",
      stance: "boundary_enforce",
      standardsLevel: 2,
      reasons: ["BOUNDARY_SEVERITY_1"],
    };
    const snapshot: BehaviourSnapshot = {
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      recentCommitmentViolations: 0,
      recentAbstinenceViolations: 0,
      focusSessionsLast7d: 0,
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      boundaryTriggered: false,
      identitySignals,
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Test",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    expect(prompt).toContain("Do NOT guilt-trip or seek reassurance");
    expect(prompt).toContain("Do NOT claim to be human");
  });

  it("Phase 7: when valueAlignmentSignals exists, adds VALUE ALIGNMENT block with instructions", () => {
    const valueAlignmentSignals: ValueAlignmentSignals = {
      misalignmentDetected: true,
      alignedValues: [],
      misalignedValues: ["discipline"],
      reasons: ["DISCIPLINE_VIOLATION"],
    };
    const snapshot: BehaviourSnapshot = {
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      recentCommitmentViolations: 0,
      recentAbstinenceViolations: 0,
      focusSessionsLast7d: 0,
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      boundaryTriggered: false,
      valueAlignmentSignals,
    };
    const prompt = buildVellaTextPrompt({
      userMessage: "Test",
      language: "en",
      behaviourSnapshot: snapshot,
    });
    expect(prompt).toContain("VALUE ALIGNMENT SIGNALS (Structured)");
    expect(prompt).toContain("misalignmentDetected");
    expect(prompt).toContain("Do not shame");
    expect(prompt).toContain("reflective question");
  });
});
