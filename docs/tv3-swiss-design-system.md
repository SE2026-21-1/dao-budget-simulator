# TV3 Swiss Fintech design system

The active presentation layer is `frontend/src/swiss.css`. It overlays the existing frontend styles without changing ABI, API, wallet signing, or transaction code. The earlier premium dark exploration remains in `frontend/src/premium.css` for comparison.

## Visual rules

- Canvas `#F8F8F5`, card white, border `#DFE6E1`, primary green `#087F5B`.
- Main text `#172B3A`, secondary `#475B67`, muted `#64748B`. Use the IBM Plex Sans fallback stack and tabular numbers for financial data.
- Use a modular grid, 12px cards, restrained borders and shadows, small semantic badges, and a visible 2px keyboard focus ring.
- Success is green, warning is amber, error is muted red. State labels always include text.
- Mobile navigation scrolls horizontally; proposal rows become labeled cards. No page-level horizontal overflow at 390px.

## Data integrity

- The Treasury KPI loads the published summary at the proposal snapshot. Missing data remains visibly missing.
- Proposal status and allocation charts represent proposals, not reserved Treasury funds.
- System status distinguishes API, database, indexer, publication, wallet, and network. Fixture mode says health is unverified.
- Review displays proposal payload information before signing. Gas cost remains in the wallet confirmation, where it can be known from the connected provider.
