# BE06 compare tại H=67

Kết quả: **FAIL — 2 mismatch.**

- Hash tham chiếu: 0x92a7e67c8c3f03bc533833fdf3391be6e1edbe9c47ec130c8482138bd22de693
- Hash rebuild: 0x92a7e67c8c3f03bc533833fdf3391be6e1edbe9c47ec130c8482138bd22de693
- Scope khớp: yes
- Chain cross-check: FAIL/BLOCKED
- Proposals: 6 / 6
- Votes: 9 / 9
- Operations: 3 / 3
- Transfers: 4 / 4
- Disbursements: 2 / 2
- Treasury in/out/balance: 13000000000000000000000 / 12000000000000000000000 / 1000000000000000000000
- Decode warnings retained: 16 / 16

## Mismatches

- `proposalStates[proposal:103910746686001166175158101077315101864533207269823235329193665818223903045664].state`: reference="Canceled"; rebuild="Defeated"
- `chain.rebuild.proposalStates[proposal:103910746686001166175158101077315101864533207269823235329193665818223903045664]`: reference={"state":"Canceled","quorum":"200000000000000000000","operationStatus":null}; rebuild={"state":"Defeated","quorum":"200000000000000000000","operationStatus":null}
