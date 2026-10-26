import pandas as pd
import numpy as np

# --- 1. SETUP DATA ---
MUN = ["Alaminos City", "Anda", "Bani", "Bolinao", "Dasol", "Infanta", "San Fabian"]
FOI = {
    "Alaminos City": {2024: 446350, 2025: 1069740, 2026: 1327670},
    "Anda": {2024: 115600, 2025: 1332211, 2026: 1510686},
    "Bani": {2024: 649400, 2025: 607800, 2026: 73500},
    "Bolinao": {2024: 21825, 2025: 4461917, 2026: 10420307},
    "Dasol": {2024: 579267, 2025: 776414, 2026: 629511},
    "Infanta": {2024: 357916, 2025: 1436623, 2026: 928140},
    "San Fabian": {2024: 96000, 2025: 70495, 2026: 91975},
}
SF_PRIMARY = {2023: 84000, 2024: 103500, 2025: 106000}

# Base shares from your 2025 Provincial Profile
BASE_SHARES = [0.0025, 0.0063, 0.0549, 0.3834, 0.2925, 0.1461, 0.0407, 0.0096, 0.0169, 0.0195, 0.0236, 0.0312]

# --- 2. NOISE INJECTION SETTINGS ---
NOISE_FACTOR = 0.15 # 15% IQR Noise
np.random.seed(42)  # Set seed so the random noise is reproducible

def annual(m, y):
    if m == "Alaminos City" and y == 2025:
        return 1099260 # Primary
    if m == "San Fabian" and y in SF_PRIMARY:
        return SF_PRIMARY[y]
    return FOI[m][y]

def get_noisy_shares():
    # Generate random noise between -15% and +15%
    noise = np.random.uniform(-NOISE_FACTOR, NOISE_FACTOR, 12)
    
    # Apply noise to base shares
    noisy_shares = np.array(BASE_SHARES) * (1 + noise)
    
    # Ensure no negative shares
    noisy_shares = np.clip(noisy_shares, 0, None)
    
    # Normalize so the 12 months still sum to exactly 1.0 (100%)
    final_shares = noisy_shares / np.sum(noisy_shares)
    return final_shares

# --- 3. GENERATE DATA ---
rows = []
# Generate for 2024 and 2025
for y in [2024, 2025]:
    for m in MUN:
        total_kg = annual(m, y)
        shares = get_noisy_shares() # Apply unique noise per municipality
        
        for month_idx, share in enumerate(shares):
            rows.append({
                "municipality": m,
                "year": y,
                "month": month_idx + 1,
                "kg": total_kg * share
            })

# --- 4. SAVE TO CSV ---
monthly_noisy_df = pd.DataFrame(rows)
monthly_noisy_df.to_csv("monthly_estimates_noisy.csv", index=False)

print("Success! 'monthly_estimates_noisy.csv' has been created.")
print("Here is a preview of the first few rows:")
print(monthly_noisy_df.head(15).round(2).to_string(index=False))