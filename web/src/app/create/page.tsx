"use client";

import CreateFlowProvider, { useCreateFlow } from "@/components/create/CreateFlowProvider";
import WizardTopBar from "@/components/create/WizardTopBar";
import StepName from "@/components/create/StepName";
import StepBattle from "@/components/create/StepBattle";
import StepCurrentState from "@/components/create/StepCurrentState";
import StepSpeechStyle from "@/components/create/StepSpeechStyle";
import StepFinalDetails from "@/components/create/StepFinalDetails";
import StepAudioUpload from "@/components/create/StepAudioUpload";
import StepGenerating from "@/components/create/StepGenerating";
import StepPreviewResult from "@/components/create/StepPreviewResult";

const STEPS = [
  StepName,
  StepBattle,
  StepCurrentState,
  StepSpeechStyle,
  StepFinalDetails,
  StepAudioUpload,
  StepGenerating,
  StepPreviewResult,
];

function CreateFlow() {
  const { step } = useCreateFlow();
  const Active = STEPS[step] ?? STEPS[0];
  return <Active key={step} />;
}

export default function CreatePage() {
  return (
    <CreateFlowProvider>
      <WizardTopBar />
      <CreateFlow />
    </CreateFlowProvider>
  );
}
