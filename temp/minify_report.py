import json
from pathlib import Path
path = Path('temp/color_report.json')
output = json.loads(path.read_text())
Path('temp/color_report.min.json').write_text(json.dumps(output, separators=(',',':')), encoding='utf-8')
