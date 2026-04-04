from fastapi import APIRouter, Query, HTTPException

from core import stats
from core.physics import ideal_gas_law

router = APIRouter(prefix="/thermo", tags=["Thermodynamics"])

EP_GAS = "/thermo/gas-law"


@router.get(
    "/gas-law",
    summary="Ideal gas law (solve for one unknown)",
    description=(
        "Solves PV = nR T for P, V, n, or T given the other three quantities. "
        "Pass solve_for as P, V, n, or T and supply the three known values as query parameters."
    ),
)
async def get_gas_law(
    solve_for: str = Query(..., description="Which variable to solve for: P, V, n, or T", examples=["P"]),
    pressure: float | None = Query(None, gt=0, description="Pressure in Pa (when known)", examples=[101325.0]),
    volume: float | None = Query(None, gt=0, description="Volume in m³ (when known)", examples=[0.0224]),
    moles: float | None = Query(None, gt=0, description="Amount of substance in mol (when known)", examples=[1.0]),
    temperature: float | None = Query(None, gt=0, description="Temperature in K (when known)", examples=[273.15]),
):
    sf_raw = solve_for.strip()
    sf_upper = sf_raw.upper()
    if sf_upper == "N" or sf_raw.lower() == "n":
        solve_key = "N"
    elif sf_upper in ("P", "V", "T"):
        solve_key = sf_upper
    else:
        raise HTTPException(status_code=400, detail="solve_for must be P, V, n, or T.")

    missing: list[str] = []
    if solve_key != "P" and pressure is None:
        missing.append("pressure")
    if solve_key != "V" and volume is None:
        missing.append("volume")
    if solve_key != "N" and moles is None:
        missing.append("moles")
    if solve_key != "T" and temperature is None:
        missing.append("temperature")
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing known quantities for solve_for={solve_for}: need {', '.join(missing)}.",
        )

    letter = "n" if solve_key == "N" else solve_key
    try:
        result = ideal_gas_law(letter, P=pressure, V=volume, n=moles, T=temperature)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    await stats.record(EP_GAS)
    return result
