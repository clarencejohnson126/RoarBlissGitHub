#!/usr/bin/env python3
"""
Test 04: LLM Constraint Following
=================================
Tests if the LLM can rewrite text while following strict timing constraints.

Success Criteria:
- LLM follows word count constraints (±2 words per segment)
- LLM preserves emotional structure
- LLM personalizes with user context
"""

import os
import sys
import json
from pathlib import Path

OUTPUT_DIR = Path("output")

# System prompt for the LLM
SYSTEM_PROMPT = """You are an expert motivational speech writer. Your task is to rewrite
motivational speeches while maintaining PRECISE timing constraints for audio synchronization.

CRITICAL RULES:
1. Each segment must have EXACTLY the target word count (±2 words maximum)
2. Powerful/emphasized words should be placed where indicated
3. Maintain the emotional arc (soft→build→climax→resolve)
4. Personalize with the user's name and goals naturally
5. Keep the motivational spirit and speaking style
6. Output MUST be valid JSON

You will receive segments with target word counts. You MUST match these counts precisely.
Count your words carefully before responding."""


def check_dependencies():
    """Check if Ollama is available."""
    try:
        import ollama
        # Try to connect
        ollama.list()
        print(f"✓ Ollama is running")
        return True
    except Exception as e:
        print(f"✗ Ollama not available: {e}")
        print("\nTo fix:")
        print("1. Install Ollama: https://ollama.com")
        print("2. Start Ollama: ollama serve")
        print("3. Pull model: ollama pull llama3:8b")
        return False


def create_test_prompt(transcript: dict, analysis: dict, user_context: dict) -> str:
    """Create a prompt for the LLM with constraints."""

    # Build segments with constraints
    segments_info = []

    for i, segment in enumerate(transcript["segments"][:5]):  # Test with first 5 segments
        word_count = len(segment["text"].split())
        duration = segment["end"] - segment["start"]

        # Find if any climax points fall in this segment
        climax_in_segment = [
            c for c in analysis.get("climax_points", [])
            if segment["start"] <= c <= segment["end"]
        ]

        seg_info = {
            "id": i + 1,
            "start": round(segment["start"], 2),
            "end": round(segment["end"], 2),
            "duration": round(duration, 2),
            "original_text": segment["text"],
            "target_word_count": word_count,
            "has_climax": len(climax_in_segment) > 0,
            "climax_time": climax_in_segment[0] if climax_in_segment else None
        }
        segments_info.append(seg_info)

    prompt = f"""# TASK
Rewrite the following motivational speech segments for a user.

# USER CONTEXT
- Name: {user_context['name']}
- Goal: {user_context['goal']}
- Struggles: {user_context.get('struggles', 'Self-doubt')}
- Tone: {user_context.get('tone', 'Confident')}

# SEGMENTS TO REWRITE
{json.dumps(segments_info, indent=2)}

# OUTPUT FORMAT
Return a JSON object with this exact structure:
{{
  "segments": [
    {{
      "id": 1,
      "original_text": "...",
      "new_text": "...",
      "target_word_count": X,
      "actual_word_count": X,
      "personalization_notes": "..."
    }}
  ]
}}

IMPORTANT:
- actual_word_count MUST equal target_word_count (±2 words)
- Count words carefully before finalizing each segment
- Return ONLY the JSON, no other text"""

    return prompt


def test_llm_constraints(transcript: dict, analysis: dict, user_context: dict) -> dict:
    """Test if LLM can follow word count constraints."""
    import ollama

    print(f"\n{'='*60}")
    print("LLM CONSTRAINT TEST")
    print(f"{'='*60}")

    # Create prompt
    prompt = create_test_prompt(transcript, analysis, user_context)

    print(f"\nUser context:")
    print(f"  Name: {user_context['name']}")
    print(f"  Goal: {user_context['goal']}")

    print(f"\nTesting with {min(5, len(transcript['segments']))} segments...")
    print("Calling LLM (this may take 30-60 seconds)...")

    # Call LLM
    response = ollama.chat(
        model='qwen2.5:7b',
        messages=[
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': prompt}
        ],
        options={
            'temperature': 0.7,
            'num_predict': 2000
        }
    )

    response_text = response['message']['content']

    # Try to parse JSON from response
    try:
        # Find JSON in response
        start = response_text.find('{')
        end = response_text.rfind('}') + 1
        if start >= 0 and end > start:
            json_str = response_text[start:end]
            result = json.loads(json_str)
        else:
            raise ValueError("No JSON found in response")
    except json.JSONDecodeError as e:
        print(f"\n⚠️  Failed to parse LLM response as JSON")
        print(f"Response preview: {response_text[:500]}...")
        return None

    # Save result
    output_path = OUTPUT_DIR / "rewritten.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"\n✓ Saved rewritten script to: {output_path}")

    return result


def validate_constraints(result: dict, transcript: dict) -> bool:
    """Validate that LLM followed the constraints."""

    print(f"\n{'='*60}")
    print("CONSTRAINT VALIDATION")
    print(f"{'='*60}")

    if not result or "segments" not in result:
        print("✗ Invalid result structure")
        return False

    total_segments = len(result["segments"])
    passed_segments = 0

    print(f"\nChecking {total_segments} segments:\n")

    for seg in result["segments"]:
        seg_id = seg.get("id", "?")
        original = seg.get("original_text", "")
        new_text = seg.get("new_text", "")
        target = seg.get("target_word_count", 0)

        # Count actual words
        actual = len(new_text.split())
        variance = abs(actual - target)

        # Check if within tolerance
        passed = variance <= 2
        status = "✓" if passed else "✗"

        if passed:
            passed_segments += 1

        print(f"{status} Segment {seg_id}:")
        print(f"  Target: {target} words | Actual: {actual} words | Variance: {variance}")
        print(f"  Original: \"{original[:50]}...\"")
        print(f"  New:      \"{new_text[:50]}...\"")
        print()

    # Calculate pass rate
    pass_rate = passed_segments / total_segments if total_segments > 0 else 0

    print(f"{'='*60}")
    print(f"RESULTS: {passed_segments}/{total_segments} segments passed ({pass_rate*100:.0f}%)")
    print(f"{'='*60}")

    if pass_rate >= 0.8:
        print("\n✓ LLM constraint following: GOOD")
        return True
    elif pass_rate >= 0.6:
        print("\n⚠️  LLM constraint following: ACCEPTABLE")
        print("    May need prompt refinement for production")
        return True
    else:
        print("\n✗ LLM constraint following: POOR")
        print("    Need to improve prompting or try different model")
        return False


def main():
    print("\n" + "="*60)
    print(" ROAR BLISS POC - Test 04: LLM Constraints")
    print("="*60)

    # Check dependencies
    if not check_dependencies():
        sys.exit(1)

    # Load transcript
    transcript_path = OUTPUT_DIR / "transcript.json"
    if not transcript_path.exists():
        print(f"\n✗ Transcript not found: {transcript_path}")
        print("  Please run 02_test_transcription.py first")
        sys.exit(1)

    with open(transcript_path) as f:
        transcript = json.load(f)

    # Load analysis
    analysis_path = OUTPUT_DIR / "analysis.json"
    if not analysis_path.exists():
        print(f"\n✗ Analysis not found: {analysis_path}")
        print("  Please run 03_test_analysis.py first")
        sys.exit(1)

    with open(analysis_path) as f:
        analysis = json.load(f)

    # User context for personalization
    user_context = {
        "name": "Clarence",
        "goal": "Build the #1 AI implementation agency in DACH",
        "struggles": "Self-doubt, imposter syndrome",
        "tone": "Confident and determined"
    }

    # Run LLM test
    try:
        result = test_llm_constraints(transcript, analysis, user_context)

        if result:
            success = validate_constraints(result, transcript)

            print("\n" + "="*60)
            print(" TEST 04 COMPLETE")
            print("="*60)

            if success:
                print("\n✓ LLM can follow timing constraints")
                print("\nNext step: Run 05_test_voice_clone.py")
            else:
                print("\n⚠️  LLM needs prompt improvement")
                print("    But you can still continue testing")
        else:
            print("\n✗ LLM test failed - could not parse response")
            sys.exit(1)

    except Exception as e:
        print(f"\n✗ Error during LLM test: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
