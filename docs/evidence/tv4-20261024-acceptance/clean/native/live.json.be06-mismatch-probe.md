# BE06 compare tại H=67

Kết quả: **FAIL — 2 mismatch.**

- Hash tham chiếu: 0xbc32028e2a38e0be34144f0d403f597e628a0c8e1c9b6551c5b3595ce9f0c53c
- Hash rebuild: 0xbc32028e2a38e0be34144f0d403f597e628a0c8e1c9b6551c5b3595ce9f0c53c
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
