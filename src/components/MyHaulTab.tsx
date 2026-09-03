import { theme } from '@/design/theme'
import { ICONS } from '@/design/sprite-data'
import PixelIcon from './PixelIcon'

const pal = theme.palette
const BODY = theme.type.size.body
const FEED = theme.type.size.feed

const ITEMS: { key: keyof typeof ICONS; name: string; rarity: string; effect: string }[] = [
  { key: 'oldMan', name: 'The Old Man', rarity: 'common', effect: 'stops traffic for 8s' },
  { key: 'pileUp', name: 'The Pile-Up', rarity: 'common', effect: 'blocks one lane' },
  { key: 'shortcut', name: 'The Shortcut', rarity: 'rare', effect: '5s more head start' },
  { key: 'safe', name: 'The Safe', rarity: 'rare', effect: 'freezes the bonus for 7 days' },
  { key: 'haul', name: 'The Haul', rarity: 'legendary', effect: 'raises the bonus cap to 110%' },
]

export default function MyHaulTab() {
  return (
    <div style={{ fontFamily: theme.type.family, color: pal.pale, fontSize: BODY, lineHeight: theme.type.lineHeight.read }}>
      <p style={{ color: pal.concrete, fontSize: FEED }}>
        No wallet connected yet — embedded wallet and on-chain recording are
        phase 3. Items are earned by playing and, once that lands, recorded
        against your address and minted retroactively. Nothing here implies a
        value, a price, or a date.
      </p>

      <h3 style={{ color: pal.amber, marginTop: 12, fontSize: BODY, fontWeight: 700 }}>The collection</h3>
      {ITEMS.map((item) => (
        <div key={item.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${pal.chrome}` }}>
          <span
            style={{
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: pal.chrome,
              flexShrink: 0,
            }}
          >
            <PixelIcon name={item.key} scale={2} />
          </span>
          <div style={{ flex: 1 }}>
            <div>{item.name} <span style={{ color: pal.concrete, fontSize: FEED }}>({item.rarity})</span></div>
            <div style={{ color: pal.concrete, fontSize: FEED }}>{item.effect}</div>
          </div>
          <span style={{ color: pal.steelLt, fontSize: FEED }}>not earned</span>
        </div>
      ))}
    </div>
  )
}
