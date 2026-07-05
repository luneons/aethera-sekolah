FROM python:3.12-slim

WORKDIR /app

# Install pip explicitly
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

# Copy backend files
COPY backend/requirements-railway.txt .
RUN pip3 install --no-cache-dir -r requirements-railway.txt

COPY backend/ .

# Create storage directories
RUN mkdir -p storage/snapshots storage/photos storage/lessons storage/proofs storage/letters

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
