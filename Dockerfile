FROM python:3.12-slim

WORKDIR /app

# Copy backend files
COPY backend/requirements-railway.txt .
RUN pip install --no-cache-dir -r requirements-railway.txt

COPY backend/ .

# Create storage directories
RUN mkdir -p storage/snapshots storage/photos storage/lessons storage/proofs storage/letters

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
