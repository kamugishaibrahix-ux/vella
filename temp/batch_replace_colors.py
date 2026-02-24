# Batch process remaining files with bg-white/5, bg-white/10 patterns
# This will help us process the many skeleton loaders and card backgrounds

import re
from pathlib import Path

files_to_process = [
    'MOBILE/components/ui/InsightsTray.tsx',
    'MOBILE/app/identity/page.tsx',
    'MOBILE/app/profile/page.tsx',
    'MOBILE/components/audio/AudioLibrarySheet.tsx',
    'MOBILE/components/regulation/RegulationStrategyList.tsx',
    'MOBILE/components/distortions/CognitiveDistortionList.tsx',
    'MOBILE/components/session-insights/SessionInsightSummary.tsx',
    'MOBILE/components/session-insights/InsightSection.tsx',
    'MOBILE/components/growth/RoadmapList.tsx',
    'MOBILE/components/themes/LifeThemeList.tsx',
    'MOBILE/components/forecast/WeeklyTrend.tsx',
    'MOBILE/components/forecast/ShortTermForecast.tsx',
    'MOBILE/components/loops/BehaviourLoopList.tsx',
    'MOBILE/app/journal/[id]/page.tsx',
    'MOBILE/components/insights/GrowthRoadmapCard.tsx',
    'MOBILE/components/growth/GrowthPlanSection.tsx',
    'MOBILE/components/insights/StrengthValuesCard.tsx',
    'MOBILE/components/insights/CognitiveDistortionsCard.tsx',
    'MOBILE/components/insights/MoodForecastCard.tsx',
    'MOBILE/components/home/MoodForecastMini.tsx',
    'MOBILE/components/insights/JournalThemesCard.tsx',
    'MOBILE/components/clarity/DeepDiveModal.tsx',
    'MOBILE/components/strategy/StrategyView.tsx',
    'MOBILE/components/clarity/ClarityCard.tsx',
    'MOBILE/components/ui/Badge.tsx',
]

replacements = [
    (r'bg-white/5', 'bg-[color:var(--mc-card)]'),
    (r'bg-white/10', 'bg-[color:var(--mc-card)]'),
    (r'bg-white/\[0\.02\]', 'bg-[color:var(--mc-card)]'),
    (r'bg-white/15', 'bg-[color:var(--mc-card-soft)]'),
    (r'bg-white/20', 'bg-[color:var(--mc-card-soft)]'),
    (r'border-white/5', 'border-[color:var(--mc-border-soft)]'),
    (r'border-white/10', 'border-[color:var(--mc-border)]'),
    (r'border-white/15', 'border-[color:var(--mc-border)]'),
    (r'border-white/20', 'border-[color:var(--mc-border)]'),
    (r'text-white/70', 'text-[color:var(--mc-muted)]'),
    (r'text-white/60', 'text-[color:var(--mc-muted)]'),
    (r'text-white/50', 'text-[color:var(--mc-muted-strong)]'),
    (r'text-white/40', 'text-[color:var(--mc-muted-strong)]'),
    (r'text-white/80', 'text-[color:var(--mc-muted)]'),
    (r'text-white/90', 'text-[color:var(--mc-text)]'),
    (r'hover:bg-white/10', 'hover:bg-[color:var(--mc-card-soft)]'),
    (r'hover:bg-white/20', 'hover:bg-[color:var(--mc-card-soft)]'),
]

processed = []
for file_path in files_to_process:
    path = Path(file_path)
    if not path.exists():
        continue
    try:
        text = path.read_text(encoding='utf-8')
        original = text
        for pattern, replacement in replacements:
            text = re.sub(pattern, replacement, text)
        if text != original:
            path.write_text(text, encoding='utf-8')
            processed.append(file_path)
    except Exception as e:
        print(f'Error processing {file_path}: {e}')

print(f'Processed {len(processed)} files')
for f in processed:
    print(f'  - {f}')
