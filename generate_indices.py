import yfinance as yf
import pandas as pd
import json

def fetch_monthly_returns(ticker_symbol):
    print(f"Fetching monthly data for {ticker_symbol}...")
    ticker = yf.Ticker(ticker_symbol)
    
    # 'max' period with '1mo' interval is standard for Yahoo Finance
    hist = ticker.history(period="max", interval="1mo")
    
    if hist.empty:
        print(f"Warning: No data found for {ticker_symbol}.")
        return []

    # Ensure we are using the Last price of the month
    # 'ME' stands for Month End in newer pandas versions
    monthly_close = hist['Close'].resample('ME').last()
    
    # Calculate monthly percentage change
    monthly_returns = monthly_close.pct_change().dropna()
    
    results = []
    for date, ret in monthly_returns.items():
        results.append({
            "year": int(date.year),
            "month": int(date.month),
            "return": round(float(ret), 6) # Higher precision for monthly compounding
        })
        
    return results

def main():
    # Adding ^GSPC (S&P 500) and ^STOXX50E (Euro Stoxx 50) 
    indices_map = {
        "SP500": "^GSPC",
        "EUROSTOXX50": "^STOXX50E",
        "OMXHPI": "^OMXHPI"
    }
    
    final_data = {}
    
    for name, symbol in indices_map.items():
        data = fetch_monthly_returns(symbol)
        if data:
            final_data[name] = data
            print(f"Processed {len(data)} months for {name} (Starting {data[0]['year']}-{data[0]['month']})")
        
    with open("indices_monthly.json", "w") as f:
        json.dump(final_data, f, indent=2)
        
    print("\nSuccess! 'indices_monthly.json' generated.")

if __name__ == "__main__":
    main()