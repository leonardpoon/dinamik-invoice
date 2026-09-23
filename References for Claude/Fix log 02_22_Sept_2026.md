Things to add:

1. CI/CD to allow updates over the air, so when i am at home and push an update the app will check if there's new updates and it will run / install the new files
2. create debit notes preset: my client has asked for more fields to be copied over when using the preset and some logic:

   1. cargo boxes amount to be copied over
   2. cargo product to be copied over
   3. cargo packing to be copied over
   4. if the first carrier vessel name and the voyage number is the same, exist in the database, automatically fill up the arrival date
   5. first carrier B/L number to be carried over but only the first half so everything before the dash. Only if the first carrier vessel and voyage number is the same
   6. outward vessel name and voyage number to be copied over
   7. outward vessel destination to be copied over
3. apparently there are multiple other usage of this debit note to different customer and each customer has a different format (?), so we will have to change the fields according to customer
4. charges is based on boxes by default, client brought up that recently have a lot of 15 boxes, usually was 16
5. there's 2 different shipment types, breakbulk and containers, both have different costing work arounds. What we modelled was containers

