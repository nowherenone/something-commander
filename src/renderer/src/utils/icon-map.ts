const ICON_MAP: Record<string, string> = {
  folder: '\uD83D\uDCC1',
  file: '\uD83D\uDCC4',
  image: '\uD83D\uDDBC\uFE0F',
  archive: '\uD83D\uDCE6',
  code: '\uD83D\uDCDD',
  document: '\uD83D\uDCC3',
  drive: '\uD83D\uDCBE',
  'hard-drive': '\uD83D\uDDB4',
  network: '\uD83C\uDF10'
}

export function getIconForHint(hint: string): string {
  return ICON_MAP[hint] || ICON_MAP.file
}
